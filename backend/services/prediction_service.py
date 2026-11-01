"""
FloodGuard – Prediction Service
=================================
Loads the production Random Forest model and experimental V2 hydrological model.
Called by /predict/rf, /predict, and /predict/v2-experimental routes.

Models:
  1. Active Production Random Forest Model (model/flood_model_rf.pkl - 144 KB)
     - 7 features: latitude, longitude, rainfall, temperature, humidity, water_level, elevation
     - Offloaded to worker threadpool; serves /predict/rf and backward-compatible /predict
  2. Experimental V2 Hydrological Danger Forecast (model/flood_model_v2.pkl - 2.08 MB)
     - Trained on verified CWC hourly river basin observations
     - Serves /predict/v2-experimental
"""

import threading
import time
from pathlib import Path
import joblib
import pandas as pd
import numpy as np

# ── Resolve model paths robustly ──────────────────────────────────────────────
_HERE = Path(__file__).resolve().parent          # backend/services/
_PROJECT_ROOT = _HERE.parent.parent              # project root
MODEL_V2_PATH = _PROJECT_ROOT / "model" / "flood_model_v2.pkl"
MODEL_RF_PATH = _PROJECT_ROOT / "model" / "flood_model_rf.pkl"

# Thread lock for safe concurrent on-demand model loading
_v2_lock = threading.Lock()

# ── Load active Random Forest prototype model eagerly at startup ───────────────
_model_rf = None
_model_rf_loaded = False
_model_rf_error: str | None = None
_model_rf_load_time_ms: float = 0.0

try:
    if not MODEL_RF_PATH.exists():
        raise FileNotFoundError(
            f"flood_model_rf.pkl not found at: {MODEL_RF_PATH}\n"
            f"Ensure the file exists at: <project_root>/model/flood_model_rf.pkl"
        )
    _t_rf0 = time.perf_counter()
    _model_rf = joblib.load(MODEL_RF_PATH)
    _model_rf_loaded = True
    _model_rf_load_time_ms = (time.perf_counter() - _t_rf0) * 1000
    print(f"[FloodGuard] [OK] flood_model_rf.pkl loaded in {_model_rf_load_time_ms:.2f} ms from: {MODEL_RF_PATH}")
except Exception as exc:
    _model_rf_error = str(exc)
    print(f"[FloodGuard] [INFO] RF model not loaded: {exc}")

# ── Lazy-loaded V2 experimental model (Loaded on-demand when called) ───────────
_model_v2 = None
_model_v2_loaded = False
_model_v2_error: str | None = None


def get_v2_model():
    """
    Thread-safe lazy loader for experimental V2 model (2.08 MB).
    Loads only when /predict/v2-experimental is explicitly called.
    """
    global _model_v2, _model_v2_loaded, _model_v2_error
    if _model_v2_loaded and _model_v2 is not None:
        return _model_v2
    with _v2_lock:
        if _model_v2_loaded and _model_v2 is not None:
            return _model_v2
        t0 = time.perf_counter()
        try:
            if not MODEL_V2_PATH.exists():
                raise FileNotFoundError(f"flood_model_v2.pkl not found at: {MODEL_V2_PATH}")
            _model_v2 = joblib.load(MODEL_V2_PATH)
            _model_v2_loaded = True
            t_ms = (time.perf_counter() - t0) * 1000
            print(f"[FloodGuard] [OK] flood_model_v2.pkl loaded on-demand in {t_ms:.2f} ms from: {MODEL_V2_PATH}")
            return _model_v2
        except Exception as exc:
            _model_v2_error = str(exc)
            print(f"[FloodGuard] [INFO] V2 experimental model not loaded: {exc}")
            raise


def is_model_loaded() -> bool:
    """Returns True if the active Random Forest model is loaded and ready."""
    return _model_rf_loaded and _model_rf is not None


def get_model_error() -> str | None:
    """Returns the error message if active Random Forest model loading failed, else None."""
    return _model_rf_error


def is_rf_model_loaded() -> bool:
    """Returns True if the active Random Forest prototype model is loaded in memory."""
    return _model_rf_loaded and _model_rf is not None


def get_rf_model_error() -> str | None:
    """Returns the error message if RF model loading failed, else None."""
    return _model_rf_error


def is_v2_model_loaded() -> bool:
    """Returns True if experimental V2 model is loaded in memory or available on disk for on-demand loading."""
    return _model_v2_loaded or (_model_v2_error is None and MODEL_V2_PATH.exists())


def get_v2_model_error() -> str | None:
    """Returns the error message if V2 model loading failed, else None."""
    return _model_v2_error


def run_prediction(
    latitude: float,
    longitude: float,
    rainfall: float,
    temperature: float,
    humidity: float,
    water_level: float,
    elevation: float,
) -> dict:
    """
    Backward-compatible prediction function for /predict route.
    Delegates to the active production Random Forest classifier.

    Returns:
        { "prediction": 0 | 1, "result": "No Flood" | "Flood" }
    """
    rf_res = run_prediction_rf(
        latitude=latitude,
        longitude=longitude,
        rainfall=rainfall,
        temperature=temperature,
        humidity=humidity,
        water_level=water_level,
        elevation=elevation,
    )
    prediction = rf_res["prediction"]
    result = "Flood" if prediction == 1 else "No Flood"
    return {"prediction": prediction, "result": result}


# ── Experimental V2 Functions ─────────────────────────────────────────────────

def validate_v2_inputs(
    latitude: float,
    longitude: float,
    rainfall: float,
    temperature: float,
    humidity: float,
    water_level: float,
    elevation: float,
) -> None:
    """
    Validates physical boundaries and mathematical constraints for V2 inference.
    Rejects invalid values that would make engineered feature calculations invalid.
    """
    if rainfall < 0:
        raise ValueError("Rainfall cannot be negative.")
    if humidity < 0 or humidity > 100:
        raise ValueError("Humidity must be between 0 and 100 percent.")
    if water_level < 0:
        raise ValueError("Water level cannot be negative.")
    if elevation <= -1.0:
        raise ValueError(
            "Elevation must be greater than -1.0 m to avoid division by zero in "
            "Elevation_Risk (1 / (elevation + 1)) and invalid domain for log1p(elevation)."
        )
    if not (-90.0 <= latitude <= 90.0):
        raise ValueError("Latitude must be between -90 and 90 degrees.")
    if not (-180.0 <= longitude <= 180.0):
        raise ValueError("Longitude must be between -180 and 180 degrees.")


def run_prediction_v2(
    latitude: float,
    longitude: float,
    rainfall: float,
    temperature: float,
    humidity: float,
    water_level: float,
    elevation: float,
) -> dict:
    """
    Apply feature engineering and run the experimental V2 Random Forest classifier.
    Returns explicit experimental metadata and 6-hour danger forecast probability.

    Parameters match the 7 API input features:
      - latitude, longitude, rainfall, temperature, humidity, water_level, elevation
    """
    model_v2 = get_v2_model()

    # Validate inputs
    validate_v2_inputs(
        latitude=latitude,
        longitude=longitude,
        rainfall=rainfall,
        temperature=temperature,
        humidity=humidity,
        water_level=water_level,
        elevation=elevation,
    )

    # Build input DataFrame with exact 12 columns in verified order
    input_data = pd.DataFrame([{
        "Latitude":        float(latitude),
        "Longitude":       float(longitude),
        "Rainfall (mm)":   float(rainfall),
        "Temperature (°C)": float(temperature),
        "Humidity (%)":    float(humidity),
        "Water Level (m)": float(water_level),
        "Elevation (m)":   float(elevation),
    }])

    # ── Engineered features (identical to training pipeline) ──────────────────
    input_data["Rainfall_Humidity"] = (
        input_data["Rainfall (mm)"] * input_data["Humidity (%)"]
    )
    input_data["Rainfall_WaterLevel"] = (
        input_data["Rainfall (mm)"] * input_data["Water Level (m)"]
    )
    input_data["Humidity_WaterLevel"] = (
        input_data["Humidity (%)"] * input_data["Water Level (m)"]
    )
    input_data["Elevation_Risk"] = (
        1 / (input_data["Elevation (m)"] + 1)
    )
    input_data["Log_Elevation"] = np.log1p(input_data["Elevation (m)"])

    # Predict using trained model inference logic
    prediction = int(model_v2.predict(input_data)[0])
    probabilities = model_v2.predict_proba(input_data)[0]
    estimated_prob = float(probabilities[1])  # Class 1 (danger level exceedance within 6h)

    result_label = "Flood Danger Warning" if prediction == 1 else "Normal (No Danger Expected)"

    return {
        "model_version": "v2_experimental",
        "forecast_horizon": "6_hour_advance_danger_forecast",
        "prediction": prediction,
        "result": result_label,
        "model_estimated_probability_percent": round(estimated_prob * 100, 2),
        "experimental": True,
        "warning_notice": (
            "EXPERIMENTAL: Calibrated for monitored CWC river stations (Shimoga, Guwahati, Kumarghat, Buxar). "
            "Six-hour advance danger forecast for evaluation only. "
            "Probability is an uncalibrated random forest model-estimated probability. "
            "Not connected to public alerts. Unmonitored stations require local datum calibration."
        ),
    }


# ── Active Production Random Forest Model Functions ───────────────────────────

def validate_rf_inputs(
    latitude: float,
    longitude: float,
    rainfall: float,
    temperature: float,
    humidity: float,
    water_level: float,
    elevation: float,
) -> None:
    """
    Validates physical boundaries and ranges for the 7 prototype model features.
    """
    if not (-90.0 <= latitude <= 90.0):
        raise ValueError("Latitude must be between -90 and 90 degrees.")
    if not (-180.0 <= longitude <= 180.0):
        raise ValueError("Longitude must be between -180 and 180 degrees.")
    if rainfall < 0:
        raise ValueError("Rainfall cannot be negative.")
    if humidity < 0 or humidity > 100:
        raise ValueError("Humidity must be between 0 and 100 percent.")
    if water_level < 0:
        raise ValueError("Water level cannot be negative.")


def run_prediction_rf(
    latitude: float,
    longitude: float,
    rainfall: float,
    temperature: float,
    humidity: float,
    water_level: float,
    elevation: float,
) -> dict:
    """
    Runs the active Random Forest classifier trained on the production dataset.

    Parameters (7 features):
      - latitude, longitude, rainfall, temperature, humidity, water_level, elevation

    Returns:
        {
            "prediction": 0 | 1,
            "status": "NO FLOOD" | "HIGH FLOOD ALERT",
            "message": str,
            "inference_time_ms": float
        }
    """
    if not _model_rf_loaded or _model_rf is None:
        raise RuntimeError(
            f"Random Forest model is not loaded. Cannot run prediction. "
            f"Error: {_model_rf_error}"
        )

    # Validate inputs
    validate_rf_inputs(
        latitude=latitude,
        longitude=longitude,
        rainfall=rainfall,
        temperature=temperature,
        humidity=humidity,
        water_level=water_level,
        elevation=elevation,
    )

    t0 = time.perf_counter()
    input_data = pd.DataFrame([{
        "latitude": float(latitude),
        "longitude": float(longitude),
        "rainfall": float(rainfall),
        "temperature": float(temperature),
        "humidity": float(humidity),
        "water_level": float(water_level),
        "elevation": float(elevation),
    }])

    prediction = int(_model_rf.predict(input_data)[0])
    inference_time_ms = (time.perf_counter() - t0) * 1000

    if prediction == 1:
        status = "HIGH FLOOD ALERT"
        message = "High flood alert! Elevated water level and rainfall conditions detected."
    else:
        status = "NO FLOOD"
        message = "No flood conditions detected based on current environmental readings."

    return {
        "prediction": prediction,
        "status": status,
        "message": message,
        "inference_time_ms": round(inference_time_ms, 2),
    }
