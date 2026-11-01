"""
FloodGuard – FastAPI Main Application
======================================
Combines routes for:
  - ESP32 live sensor data (POST /sensor, GET /sensor)
  - Flood risk prediction (POST /predict/rf, POST /predict, POST /predict/v2-experimental)
  - Alert history (GET /alerts)
  - SMS alert gateway (GET /sms/status, POST /sms/test-send, GET /sms/history)
  - Health & component status (GET /, GET /health, GET /status)
"""

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load .env from project root
_HERE = Path(__file__).resolve().parent
_PROJECT_ROOT = _HERE.parent
load_dotenv(_PROJECT_ROOT / ".env")

from backend.routes.sensor import router as sensor_router
from backend.routes.prediction import router as prediction_router
from backend.routes.alerts import router as alerts_router
from backend.routes.sms import router as sms_router
from backend.services.prediction_service import (
    is_model_loaded,
    get_model_error,
    is_rf_model_loaded,
    get_rf_model_error,
    is_v2_model_loaded,
    get_v2_model_error,
)
from backend.services.sms_service import get_sms_status as get_sms_gateway_status
from backend.database import init_db
from backend.database_sms import init_sms_db

# ── Initialize MySQL Database ────────────────────────────────────────────────
init_db()
init_sms_db()

# ── Initialize FastAPI app ────────────────────────────────────────────────────
app = FastAPI(
    title="FloodGuard – Flood Risk Prediction API",
    description=(
        "Real-time flood risk monitoring and prediction system. "
        "Receives ESP32 sensor data via Bluetooth and runs a Random Forest "
        "classifier to predict flood risk. "
        "ESP32 provides: temperature, humidity, rainfall, water_level. "
        "System provides: latitude, longitude, elevation."
    ),
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount Routers ─────────────────────────────────────────────────────────────
app.include_router(sensor_router)
app.include_router(prediction_router)
app.include_router(alerts_router)
app.include_router(sms_router)

# ── Helper for sensor status ──────────────────────────────────────────────────
from backend.routes.sensor import _latest_sensor


def get_sensor_status() -> dict:
    """Returns whether the sensor has received data and the latest timestamp."""
    return {
        "connected": _latest_sensor["connected"],
        "timestamp": _latest_sensor["timestamp"],
    }


# ── Health & Status Endpoints ─────────────────────────────────────────────────

@app.get("/", tags=["Health"], summary="API Root Health Check")
async def root():
    """
    Simple probe to confirm the server is running.
    """
    return {
        "status": "ok",
        "message": "Flood Risk Prediction API is running",
    }


@app.get("/health", tags=["Health"], summary="Detailed health check")
async def health():
    """
    Returns API status and whether the ML model loaded successfully.
    """
    rf_ok = is_rf_model_loaded()
    rf_err = get_rf_model_error()
    v2_ok = is_v2_model_loaded()
    v2_err = get_v2_model_error()

    return {
        "status":          "ok" if rf_ok else "degraded",
        "api":             "FastAPI",
        "version":         "2.0.0",
        "model_loaded":    rf_ok,
        "rf_model_loaded": rf_ok,
        "rf_model_error":  rf_err,
        "v2_model_loaded": v2_ok,
        "v2_model_error":  v2_err,
    }


@app.get("/status", tags=["Health"], summary="System component status")
async def get_system_status():
    """
    Returns truthful status of all system components based on actual application state:
    - FastAPI Backend availability
    - Production Random Forest model loading status
    - Experimental V2 hydrological model loading status
    - ESP32 & sensor connection status (from actual telemetry)
    - SMS Gateway configuration status
    """
    rf_ok = is_rf_model_loaded()
    rf_err = get_rf_model_error()
    v2_ok = is_v2_model_loaded()
    v2_err = get_v2_model_error()
    sensor_info = get_sensor_status()
    sensor_connected = sensor_info["connected"]
    sensor_ts = sensor_info["timestamp"]
    sms_info = get_sms_gateway_status()

    return {
        "status": "ok" if rf_ok else "degraded",
        "timestamp": sensor_ts,
        "backend": {
            "status": "connected",
            "message": "FastAPI is running and reachable",
            "version": "2.0.0",
        },
        "rf_model": {
            "status": "ready" if rf_ok else "unavailable",
            "loaded": rf_ok,
            "error": rf_err,
            "name": "flood_model_rf.pkl",
        },
        "v2_model": {
            "status": "ready" if v2_ok else "unavailable",
            "loaded": v2_ok,
            "error": v2_err,
            "name": "flood_model_v2.pkl",
        },
        "esp32": {
            "status": "connected" if sensor_connected else "disconnected",
            "connected": sensor_connected,
            "last_reading": sensor_ts,
            "description": (
                "Receiving live sensor readings via Bluetooth"
                if sensor_connected
                else "No sensor data received from ESP32 yet"
            ),
        },
        "sms_gateway": {
            "status": "ready" if sms_info.get("ready") else "configured" if sms_info.get("admin_test_phone_configured") else "not_configured",
            "provider": sms_info.get("provider", "twilio"),
            "ready": sms_info.get("ready", False),
            "demo_mode": sms_info.get("demo_mode", True),
            "admin_test_phone_configured": sms_info.get("admin_test_phone_configured", False),
            "admin_test_phone_masked": sms_info.get("admin_test_phone_masked", "Not Configured"),
            "daily_test_count": sms_info.get("daily_test_count", 0),
            "daily_test_limit": sms_info.get("daily_test_limit", 5),
            "community_broadcast_enabled": False,
            "message": (
                "Twilio test gateway ready"
                if sms_info.get("ready")
                else "Twilio credentials pending in .env"
            ),
        },
    }
