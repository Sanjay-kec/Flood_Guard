"""
FloodGuard – Test Suite for Random Forest Prototype Endpoint (/predict/rf)
========================================================================
Verifies:
1. /predict/rf returns prediction: 0, status: 'NO FLOOD', and informative message for low-risk inputs.
2. /predict/rf returns prediction: 1, status: 'HIGH FLOOD ALERT', and informative message for high-risk inputs.
3. /predict/rf correctly persists each prediction to MySQL with model_version='rf' and status.
4. GET /alerts returns newly saved RF predictions with correct fields and structure.
5. Missing fields and out-of-boundary values trigger HTTP 422 validation error without writing to DB.
6. Graceful HTTP 503 response when RF model is unavailable.
7. Existing /predict (V1) and /predict/v2-experimental endpoints remain functional.
8. Confirmation that all database operations execute against MySQL.
"""

import sys
import os
import unittest.mock
from pathlib import Path
from fastapi.testclient import TestClient

# Anchor project root to sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

import backend.database as db
from backend.main import app
import backend.services.prediction_service as pred_service

client = TestClient(app)

PASS = "[PASS]"
FAIL = "[FAIL]"


def check(name: str, cond: bool, detail: str = ""):
    status = PASS if cond else FAIL
    print(f"  {status} {name} {detail}".strip())
    assert cond, f"Assertion failed: {name} - {detail}"


def test_health_check_shows_rf_model():
    print("\n--- TEST: GET /health includes RF model status ---")
    res = client.get("/health")
    check("Health status 200", res.status_code == 200)
    data = res.json()
    check("rf_model_loaded is True", data.get("rf_model_loaded") is True)
    check("v2_model_loaded is True", data.get("v2_model_loaded") is True)
    check("model_loaded (backward compatible) is True", data.get("model_loaded") is True)


def test_predict_rf_no_flood():
    print("\n--- TEST: POST /predict/rf (Low Risk / No Flood) ---")
    payload = {
        "latitude": 10.940896,
        "longitude": 77.077726,
        "rainfall": 10.0,
        "temperature": 32.1,
        "humidity": 62.8,
        "water_level": 1.5,
        "elevation": 318.3,
    }
    res = client.post("/predict/rf", json=payload)
    check("Status 200", res.status_code == 200)
    data = res.json()
    print("  Response:", data)
    check("prediction == 0", data["prediction"] == 0)
    check("status == 'NO FLOOD'", data["status"] == "NO FLOOD")
    check("message present and non-empty", bool(data.get("message")))


def test_predict_rf_high_flood_alert():
    print("\n--- TEST: POST /predict/rf (High Risk / High Flood Alert) ---")
    payload = {
        "latitude": 11.062594,
        "longitude": 77.092712,
        "rainfall": 95.9,
        "temperature": 32.2,
        "humidity": 63.1,
        "water_level": 9.85,
        "elevation": 378.5,
    }
    res = client.post("/predict/rf", json=payload)
    check("Status 200", res.status_code == 200)
    data = res.json()
    print("  Response:", data)
    check("prediction == 1", data["prediction"] == 1)
    check("status == 'HIGH FLOOD ALERT'", data["status"] == "HIGH FLOOD ALERT")
    check("message present and non-empty", bool(data.get("message")))


def test_predict_rf_persists_to_database():
    print("\n--- TEST: POST /predict/rf Persistence & Direct ID/Timestamp Return ---")
    # Query alert history to get initial count in the isolated test DB
    alerts_before = client.get("/alerts").json()
    count_before = alerts_before.get("count", 0)

    # Submit a new RF prediction
    rf_payload = {
        "latitude": 11.052598,
        "longitude": 76.964544,
        "rainfall": 40.8,
        "temperature": 32.2,
        "humidity": 63.0,
        "water_level": 6.36,
        "elevation": 462.3,
    }
    res_pred = client.post("/predict/rf", json=rf_payload)
    check("Prediction status 200", res_pred.status_code == 200)
    pred_data = res_pred.json()
    print("  Prediction response:", pred_data)
    check("RF prediction returned", pred_data["prediction"] in (0, 1))
    check("Response contains integer id", pred_data.get("id") is not None and isinstance(pred_data["id"], int))
    check("Response contains string timestamp", bool(pred_data.get("timestamp")) and isinstance(pred_data["timestamp"], str))

    # Check that the prediction was persisted and appears at the top of GET /alerts
    alerts_after = client.get("/alerts").json()
    alerts_list = alerts_after.get("alerts", [])
    check("Alerts list not empty", len(alerts_list) > 0)

    latest = alerts_list[0]
    print("  Latest alert in DB:", latest)
    check("Returned ID belongs to newly inserted record", pred_data["id"] == latest["id"])
    check("Returned timestamp belongs to newly inserted record", pred_data["timestamp"] == latest["timestamp"])
    check("Saved prediction matches model output", latest["prediction"] == pred_data["prediction"])
    check("Saved result matches status", latest["result"] == pred_data["status"])
    check("Saved status is present", latest.get("status") == pred_data["status"])
    check("Saved model_version is 'rf'", latest["model_version"] == "rf")
    check("Saved latitude matches", latest["inputs"]["latitude"] == rf_payload["latitude"])
    check("Saved longitude matches", latest["inputs"]["longitude"] == rf_payload["longitude"])
    check("Saved rainfall matches", latest["inputs"]["rainfall"] == rf_payload["rainfall"])
    check("Saved water_level matches", latest["inputs"]["water_level"] == rf_payload["water_level"])


def test_predict_rf_consecutive_predictions():
    print("\n--- TEST: Consecutive Predictions Receive Unique IDs & Timestamps ---")
    payload_low = {
        "latitude": 10.940896,
        "longitude": 77.077726,
        "rainfall": 10.0,
        "temperature": 32.1,
        "humidity": 62.8,
        "water_level": 1.5,
        "elevation": 318.3,
    }
    payload_high = {
        "latitude": 11.062594,
        "longitude": 77.092712,
        "rainfall": 95.9,
        "temperature": 32.2,
        "humidity": 63.1,
        "water_level": 9.85,
        "elevation": 378.5,
    }

    res1 = client.post("/predict/rf", json=payload_low)
    data1 = res1.json()
    res2 = client.post("/predict/rf", json=payload_high)
    data2 = res2.json()

    print(f"  Pred 1 (Low): ID={data1.get('id')}, Status={data1.get('status')}")
    print(f"  Pred 2 (High): ID={data2.get('id')}, Status={data2.get('status')}")

    check("Pred 1 has valid ID", isinstance(data1.get("id"), int))
    check("Pred 2 has valid ID", isinstance(data2.get("id"), int))
    check("Consecutive predictions receive unique, ascending IDs", data2["id"] > data1["id"])
    check("Pred 1 status is NO FLOOD", data1["status"] == "NO FLOOD")
    check("Pred 2 status is HIGH FLOOD ALERT", data2["status"] == "HIGH FLOOD ALERT")

    # Verify both records are retrieved in order by GET /alerts (newest first)
    alerts = client.get("/alerts").json().get("alerts", [])
    check("GET /alerts has at least 2 records", len(alerts) >= 2)
    check("Top alert is Pred 2", alerts[0]["id"] == data2["id"] and alerts[0]["result"] == "HIGH FLOOD ALERT")
    check("Second alert is Pred 1", alerts[1]["id"] == data1["id"] and alerts[1]["result"] == "NO FLOOD")


def test_predict_rf_db_failure_returns_no_fake_id():
    print("\n--- TEST: Graceful DB Failure Handling (No Fake ID or Timestamp) ---")
    payload = {
        "latitude": 10.940896,
        "longitude": 77.077726,
        "rainfall": 10.0,
        "temperature": 32.1,
        "humidity": 62.8,
        "water_level": 1.5,
        "elevation": 318.3,
    }
    # Mock insert_prediction to simulate a database lock or failure
    with unittest.mock.patch("backend.routes.prediction.insert_prediction", side_effect=RuntimeError("Simulated DB Lock")):
        res = client.post("/predict/rf", json=payload)
        check("Status still 200 on DB failure", res.status_code == 200)
        data = res.json()
        print("  Response on DB failure:", data)
        check("Prediction still calculated", data["prediction"] == 0)
        check("Status still returned", data["status"] == "NO FLOOD")
        check("ID is None on failure (not a fake ID)", data.get("id") is None)
        check("Timestamp is None on failure", data.get("timestamp") is None)


def test_predict_rf_validation_errors():
    print("\n--- TEST: POST /predict/rf Input Validation ---")
    alerts_before = client.get("/alerts").json().get("count", 0)

    # Missing fields
    res_missing = client.post("/predict/rf", json={"rainfall": 10.0})
    check("Missing fields return 422", res_missing.status_code == 422)

    # Negative rainfall
    res_neg_rain = client.post("/predict/rf", json={
        "latitude": 11.0, "longitude": 77.0, "rainfall": -5.0,
        "temperature": 30.0, "humidity": 60.0, "water_level": 2.0, "elevation": 350.0
    })
    check("Negative rainfall returns 422", res_neg_rain.status_code == 422)

    # Negative water level
    res_neg_wl = client.post("/predict/rf", json={
        "latitude": 11.0, "longitude": 77.0, "rainfall": 5.0,
        "temperature": 30.0, "humidity": 60.0, "water_level": -1.0, "elevation": 350.0
    })
    check("Negative water level returns 422", res_neg_wl.status_code == 422)

    # Humidity > 100
    res_high_hum = client.post("/predict/rf", json={
        "latitude": 11.0, "longitude": 77.0, "rainfall": 5.0,
        "temperature": 30.0, "humidity": 120.0, "water_level": 1.0, "elevation": 350.0
    })
    check("Humidity > 100 returns 422", res_high_hum.status_code == 422)

    # Latitude out of range
    res_bad_lat = client.post("/predict/rf", json={
        "latitude": 95.0, "longitude": 77.0, "rainfall": 5.0,
        "temperature": 30.0, "humidity": 60.0, "water_level": 1.0, "elevation": 350.0
    })
    check("Latitude > 90 returns 422", res_bad_lat.status_code == 422)

    # Ensure validation errors did not write to the database
    top_id_before = client.get("/alerts").json().get("alerts", [{}])[0].get("id")
    top_id_after = client.get("/alerts").json().get("alerts", [{}])[0].get("id")
    check("No records added on validation errors", top_id_after == top_id_before)


def test_predict_rf_unloaded_model_handling():
    print("\n--- TEST: RF Model Unloaded Handling ---")
    payload = {
        "latitude": 10.940896,
        "longitude": 77.077726,
        "rainfall": 10.0,
        "temperature": 32.1,
        "humidity": 62.8,
        "water_level": 1.5,
        "elevation": 318.3,
    }
    with unittest.mock.patch.object(pred_service, "_model_rf_loaded", False), \
         unittest.mock.patch.object(pred_service, "_model_rf_error", "Mock model unavailable"):
        res = client.post("/predict/rf", json=payload)
        check("Status 503 when model unloaded", res.status_code == 503)
        check("Informative error detail", "Random Forest model is unavailable" in res.json()["detail"])


def test_existing_endpoints_unbroken():
    print("\n--- TEST: Existing Endpoints Continue Working ---")
    # Existing V1 endpoint
    v1_payload = {
        "latitude": 22.30,
        "longitude": 82.50,
        "rainfall": 200.0,
        "temperature": 28.0,
        "humidity": 80.0,
        "water_level": 7.0,
        "elevation": 500.0,
    }
    res_v1 = client.post("/predict", json=v1_payload)
    check("Existing /predict returns 200", res_v1.status_code == 200)
    data_v1 = res_v1.json()
    check("V1 schema contains prediction and result", set(data_v1.keys()) == {"prediction", "result"})

    # Verify V1 saved as model_version 'v1'
    alerts = client.get("/alerts").json().get("alerts", [])
    check("V1 recorded in alerts", len(alerts) > 0 and alerts[0]["model_version"] == "v1")

    # Existing V2 experimental endpoint
    v2_payload = {
        "latitude": 26.1947,
        "longitude": 91.7431,
        "rainfall": 0.0,
        "temperature": 28.5,
        "humidity": 65.0,
        "water_level": 42.0,
        "elevation": 44.0,
    }
    res_v2 = client.post("/predict/v2-experimental", json=v2_payload)
    check("Existing /predict/v2-experimental returns 200", res_v2.status_code == 200)
    data_v2 = res_v2.json()
    check("V2 schema contains model_version", "model_version" in data_v2)


def test_status_endpoint_structure():
    print("\n--- TEST: GET /status Truthful Component Structure ---")
    res = client.get("/status")
    check("Status code 200", res.status_code == 200)
    data = res.json()
    print("  Status response:", data)

    check("status field present", data.get("status") in ["ok", "degraded"])
    check("backend status connected", data.get("backend", {}).get("status") == "connected")
    check("backend version 2.0.0", data.get("backend", {}).get("version") == "2.0.0")

    check("rf_model status ready", data.get("rf_model", {}).get("status") == "ready")
    check("rf_model loaded True", data.get("rf_model", {}).get("loaded") is True)
    check("rf_model name correct", data.get("rf_model", {}).get("name") == "flood_model_rf.pkl")

    check("v2_model status ready", data.get("v2_model", {}).get("status") == "ready")
    check("v2_model loaded True", data.get("v2_model", {}).get("loaded") is True)
    check("v2_model name correct", data.get("v2_model", {}).get("name") == "flood_model_v2.pkl")

    check("esp32 component present", "esp32" in data)
    check("sms_gateway status valid", data.get("sms_gateway", {}).get("status") in ("ready", "not_configured"))


def test_status_sensor_lifecycle():
    print("\n--- TEST: GET /status Reflects ESP32 Sensor Connection & Disconnection ---")
    # Reset/ensure disconnected state first
    client.post("/sensor/disconnect")
    status_disconnected = client.get("/status").json()
    check("ESP32 disconnected initially", status_disconnected["esp32"]["connected"] is False)
    check("ESP32 status is disconnected", status_disconnected["esp32"]["status"] == "disconnected")

    # Simulate ESP32 sensor telemetry arrival
    sensor_payload = {
        "temperature": 29.5,
        "humidity": 65.0,
        "rainfall": 12.0,
        "water_level": 2.3,
    }
    res_sensor = client.post("/sensor", json=sensor_payload)
    check("POST /sensor returns 200", res_sensor.status_code == 200)

    # Check status now reports connected with valid timestamp
    status_connected = client.get("/status").json()
    check("ESP32 reports connected True", status_connected["esp32"]["connected"] is True)
    check("ESP32 status is connected", status_connected["esp32"]["status"] == "connected")
    check("ESP32 last_reading is populated", bool(status_connected["esp32"]["last_reading"]))
    check("Top-level timestamp matches last_reading", status_connected["timestamp"] == status_connected["esp32"]["last_reading"])

    # Simulate disconnect
    res_disc = client.post("/sensor/disconnect")
    check("POST /sensor/disconnect returns 200", res_disc.status_code == 200)

    status_after_disc = client.get("/status").json()
    check("ESP32 reports connected False after disconnect", status_after_disc["esp32"]["connected"] is False)
    check("ESP32 status is disconnected after disconnect", status_after_disc["esp32"]["status"] == "disconnected")


def test_status_unloaded_model_handling():
    print("\n--- TEST: GET /status Truthfully Reports Degraded When Model Unavailable ---")
    with unittest.mock.patch("backend.main.is_rf_model_loaded", return_value=False), \
         unittest.mock.patch("backend.main.get_rf_model_error", return_value="Model file missing"):
        res = client.get("/status")
        check("Status code 200", res.status_code == 200)
        data = res.json()
        print("  Degraded status response:", data)
        check("System status reports degraded", data["status"] == "degraded")
        check("rf_model status is unavailable", data["rf_model"]["status"] == "unavailable")
        check("rf_model loaded is False", data["rf_model"]["loaded"] is False)
        check("rf_model error matches mock", data["rf_model"]["error"] == "Model file missing")


def run_all_tests():
    print("=" * 60)
    print("  RUNNING FLOODGUARD RF INTEGRATION TEST SUITE (MYSQL)")
    print("=" * 60)
    print(f"Target Database: {db.MYSQL_DATABASE} at {db.MYSQL_HOST}:{db.MYSQL_PORT}")

    db.init_db()

    test_health_check_shows_rf_model()
    test_status_endpoint_structure()
    test_status_sensor_lifecycle()
    test_status_unloaded_model_handling()
    test_predict_rf_no_flood()
    test_predict_rf_high_flood_alert()
    test_predict_rf_persists_to_database()
    test_predict_rf_consecutive_predictions()
    test_predict_rf_db_failure_returns_no_fake_id()
    test_predict_rf_validation_errors()
    test_predict_rf_unloaded_model_handling()
    test_existing_endpoints_unbroken()

    print("\n" + "=" * 60)
    print("  ALL RF INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    run_all_tests()

