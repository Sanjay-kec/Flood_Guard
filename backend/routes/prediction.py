"""
FloodGuard – Prediction Routes
================================
Handles POST /predict — calls the ML prediction service with 7 features.

INPUTS (7 required):
  latitude, longitude, rainfall, temperature, humidity, water_level, elevation

DO NOT add extra features (River Discharge, Land Cover, Soil Type, etc.)
DO NOT retrain the model.
"""

import time
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.services.prediction_service import (
    run_prediction,
    is_model_loaded,
    run_prediction_v2,
    is_v2_model_loaded,
    get_v2_model_error,
    run_prediction_rf,
    is_rf_model_loaded,
    get_rf_model_error,
)
from backend.database import insert_prediction

router = APIRouter()


# ── Pydantic models ───────────────────────────────────────────────────────────

class PredictionRequest(BaseModel):
    """
    The exact 7 features the trained Random Forest model expects.

    ESP32 provides: rainfall, temperature, humidity, water_level
    System provides: latitude, longitude, elevation
    """
    latitude:    float   # System/browser location – NOT from ESP32
    longitude:   float   # System/browser location – NOT from ESP32
    rainfall:    float   # mm – from ESP32 rain sensor
    temperature: float   # °C – from ESP32 temperature sensor
    humidity:    float   # %  – from ESP32 humidity sensor
    water_level: float   # m  – from ESP32 water level sensor
    elevation:   float   # m  – system location – NOT from ESP32


class PredictionResponse(BaseModel):
    prediction: int     # 0 = No Flood, 1 = Flood
    result:     str     # "No Flood" or "Flood"


class PredictionV2Response(BaseModel):
    model_version: str = Field(..., description="Model version tag")
    forecast_horizon: str = Field(..., description="Forecasting time horizon")
    prediction: int = Field(..., description="0 = Normal, 1 = Flood Danger Warning")
    result: str = Field(..., description="Descriptive status label")
    model_estimated_probability_percent: float = Field(..., description="Estimated danger probability (0-100%)")
    experimental: bool = Field(True, description="Always true for experimental endpoint")
    warning_notice: str = Field(..., description="Operational boundaries and calibration disclaimer")


class PredictionRFResponse(BaseModel):
    prediction: int = Field(..., description="0 = NO FLOOD, 1 = HIGH FLOOD ALERT")
    status: str = Field(..., description="NO FLOOD or HIGH FLOOD ALERT")
    message: str = Field(..., description="Informative status message")
    id: int | None = Field(None, description="Database record ID if persisted to MySQL")
    timestamp: str | None = Field(None, description="ISO timestamp if persisted to MySQL")
    execution_time_ms: float | None = Field(None, description="Prediction execution duration in milliseconds")
    target_led: str | None = Field(None, description="Target LED command: LED_ON or LED_OFF")
    hardware_led_state: str | None = Field(None, description="Physical hardware LED state: ON, OFF, or UNKNOWN")
    hardware_led_synced: bool | None = Field(None, description="True if physical hardware LED is confirmed synced")
    receiver_connected: bool | None = Field(None, description="True if Bluetooth receiver is connected")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/predict",
    response_model=PredictionResponse,
    tags=["Prediction"],
    summary="Run flood risk prediction via Random Forest model",
)
def predict(payload: PredictionRequest):
    """
    Runs the Random Forest classifier with the supplied 7-feature input.

    Feature engineering applied internally (same as training):
      - Rainfall_Humidity   = Rainfall × Humidity
      - Rainfall_WaterLevel = Rainfall × Water Level
      - Humidity_WaterLevel = Humidity × Water Level
      - Elevation_Risk      = 1 / (Elevation + 1)
      - Log_Elevation       = log1p(Elevation)

    Returns:
        { "prediction": 0, "result": "No Flood" }
        or
        { "prediction": 1, "result": "Flood" }
    """
    if not is_model_loaded():
        raise HTTPException(
            status_code=503,
            detail="ML model is not loaded. Check backend startup logs."
        )

    try:
        result = run_prediction(
            latitude=payload.latitude,
            longitude=payload.longitude,
            rainfall=payload.rainfall,
            temperature=payload.temperature,
            humidity=payload.humidity,
            water_level=payload.water_level,
            elevation=payload.elevation,
        )

        # Persist prediction to MySQL database
        try:
            insert_prediction(
                latitude=payload.latitude,
                longitude=payload.longitude,
                elevation=payload.elevation,
                rainfall=payload.rainfall,
                temperature=payload.temperature,
                humidity=payload.humidity,
                water_level=payload.water_level,
                prediction=result["prediction"],
                result=result["result"],
                model_version="v1",
            )
        except Exception as db_exc:
            print(f"[Prediction] [DB ERROR] Failed to save prediction: {db_exc}")

        # Synchronize target physical LED actuation
        try:
            target_cmd = "LED_ON" if (result.get("prediction") == 1 or result.get("result") == "Flood") else "LED_OFF"
            from backend.routes.sensor import set_target_led_command
            set_target_led_command(target_cmd)
        except Exception as led_exc:
            print(f"[Prediction] Failed to set target LED command: {led_exc}")

        return result
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post(
    "/predict/v2-experimental",
    response_model=PredictionV2Response,
    tags=["Prediction"],
    summary="Run experimental 6-hour advance flood danger forecast (V2)",
)
def predict_v2(payload: PredictionRequest):
    """
    Runs the experimental V2 Random Forest classifier trained on verified CWC hydrological telemetry.
    Predicts danger-level exceedance 6 hours ahead (t+1 through t+6).

    Isolated from production alerts, SMS, sirens, and actuators.
    """
    if not is_v2_model_loaded():
        err_msg = get_v2_model_error() or "V2 experimental model is not loaded."
        raise HTTPException(
            status_code=503,
            detail=f"V2 experimental model is unavailable: {err_msg}. Existing /predict endpoint remains operational."
        )

    try:
        result = run_prediction_v2(
            latitude=payload.latitude,
            longitude=payload.longitude,
            rainfall=payload.rainfall,
            temperature=payload.temperature,
            humidity=payload.humidity,
            water_level=payload.water_level,
            elevation=payload.elevation,
        )
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=422, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post(
    "/predict/rf",
    response_model=PredictionRFResponse,
    tags=["Prediction"],
    summary="Run prototype Random Forest flood prediction",
)
def predict_rf(payload: PredictionRequest):
    """
    Runs the Random Forest classifier trained on the uploaded prototype flood dataset.
    Validates the 7 input features: latitude, longitude, rainfall, temperature, humidity, water_level, elevation.
    Offloaded to a worker threadpool (def instead of async def) to keep the main event loop unblocked.

    Prediction status:
      - 0 = NO FLOOD
      - 1 = HIGH FLOOD ALERT

    Returns:
        {
            "prediction": 0,
            "status": "NO FLOOD",
            "message": "No flood conditions detected based on current environmental readings.",
            "id": 12,
            "timestamp": "2026-10-28T...",
            "execution_time_ms": 42.15
        }
    """
    if not is_rf_model_loaded():
        err_msg = get_rf_model_error() or "Random Forest model is not loaded."
        raise HTTPException(
            status_code=503,
            detail=f"Random Forest model is unavailable: {err_msg}. Existing /predict endpoint remains operational."
        )

    t_start = time.perf_counter()
    try:
        result = run_prediction_rf(
            latitude=payload.latitude,
            longitude=payload.longitude,
            rainfall=payload.rainfall,
            temperature=payload.temperature,
            humidity=payload.humidity,
            water_level=payload.water_level,
            elevation=payload.elevation,
        )
        t_infer_end = time.perf_counter()

        # Persist prediction to MySQL database
        db_id = None
        db_timestamp = None
        try:
            db_timestamp = datetime.now().isoformat()
            db_id = insert_prediction(
                latitude=payload.latitude,
                longitude=payload.longitude,
                elevation=payload.elevation,
                rainfall=payload.rainfall,
                temperature=payload.temperature,
                humidity=payload.humidity,
                water_level=payload.water_level,
                prediction=result["prediction"],
                result=result["status"],
                timestamp=db_timestamp,
                model_version="rf",
            )
        except Exception as db_exc:
            print(f"[Prediction RF] [DB ERROR] Failed to save prediction: {db_exc}")
            db_id = None
            db_timestamp = None

        # Synchronize physical LED target command and retrieve hardware confirmation state
        target_cmd = "LED_ON" if (result["prediction"] == 1 or result["status"] == "HIGH FLOOD ALERT") else "LED_OFF"
        from backend.routes.sensor import set_target_led_command, get_led_status
        set_target_led_command(target_cmd)
        led_info = get_led_status()

        t_end = time.perf_counter()
        infer_ms = (t_infer_end - t_start) * 1000
        db_ms = (t_end - t_infer_end) * 1000
        total_ms = (t_end - t_start) * 1000

        print(
            f"[Prediction RF] Status={result['status']} | TargetLED={target_cmd} | "
            f"HardwareSynced={led_info['synced']} | Total: {total_ms:.2f}ms "
            f"(Inference: {infer_ms:.2f}ms, DB: {db_ms:.2f}ms)"
        )

        return {
            "prediction": result["prediction"],
            "status": result["status"],
            "message": result["message"],
            "id": db_id,
            "timestamp": db_timestamp,
            "execution_time_ms": round(total_ms, 2),
            "target_led": target_cmd,
            "hardware_led_state": led_info["hardware_state"],
            "hardware_led_synced": led_info["synced"],
            "receiver_connected": led_info["receiver_connected"],
        }
    except ValueError as val_err:
        raise HTTPException(status_code=422, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
