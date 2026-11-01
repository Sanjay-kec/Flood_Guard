"""
FloodGuard Stage 5 – V2 Integration Test Suite
================================================
Verifies that:
1. V1 production endpoint (/predict) remains active and unmodified.
2. V2 experimental endpoint (/predict/v2-experimental) operates in parallel.
3. Missing or invalid inputs trigger HTTP 422.
4. Physical and mathematical boundary violations (negative rainfall, invalid elevation) trigger HTTP 422.
5. If the V2 model is unavailable, V2 returns HTTP 503 while V1 continues operating normally.
6. Probabilities are finite and within 0–100%; predictions are strictly binary (0 or 1).
7. Fixed-input regression tests match actual recorded model outputs.
8. V2 execution does NOT modify sensor state or alert history.
"""

import sys
import unittest.mock
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure project root is in sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from backend.main import app
import backend.services.prediction_service as pred_service

client = TestClient(app)

PASS = "[PASS]"
FAIL = "[FAIL]"


def print_check(name: str, cond: bool, detail: str = ""):
    status = PASS if cond else FAIL
    print(f"  {status} {name} {detail}".strip())
    assert cond, f"Assertion failed: {name} - {detail}"


def test_v1_production_endpoint_unmodified():
    print("\n--- Test 1: V1 Production Endpoint Unmodified ---")
    payload = {
        "latitude": 22.30,
        "longitude": 82.50,
        "rainfall": 200.0,
        "temperature": 28.0,
        "humidity": 80.0,
        "water_level": 7.0,
        "elevation": 500.0,
    }
    response = client.post("/predict", json=payload)
    print_check("HTTP Status 200", response.status_code == 200)
    data = response.json()
    print_check("Exact Schema [prediction, result]", set(data.keys()) == {"prediction", "result"})
    print_check("Prediction is binary", data["prediction"] in (0, 1))
    print_check("Result is string", data["result"] in ("No Flood", "Flood"))
    # Verified recorded output for this input on V1 model is prediction=1
    print_check("V1 recorded prediction matches", data["prediction"] == 1 and data["result"] == "Flood")


def test_v2_experimental_endpoint_schema_and_metadata():
    print("\n--- Test 2: V2 Experimental Endpoint Schema and Metadata ---")
    payload_guwahati = {
        "latitude": 26.1947,
        "longitude": 91.7431,
        "rainfall": 0.0,
        "temperature": 28.5,
        "humidity": 65.0,
        "water_level": 42.0,
        "elevation": 44.0,
    }
    response = client.post("/predict/v2-experimental", json=payload_guwahati)
    print_check("HTTP Status 200", response.status_code == 200)
    data = response.json()
    expected_keys = {
        "model_version",
        "forecast_horizon",
        "prediction",
        "result",
        "model_estimated_probability_percent",
        "experimental",
        "warning_notice",
    }
    print_check("Exact Schema Keys", set(data.keys()) == expected_keys)
    print_check("Model Version Tag", data["model_version"] == "v2_experimental")
    print_check("Forecast Horizon Tag", data["forecast_horizon"] == "6_hour_advance_danger_forecast")
    print_check("Experimental Flag True", data["experimental"] is True)
    print_check("Prediction is binary", data["prediction"] in (0, 1))
    prob = data["model_estimated_probability_percent"]
    print_check("Probability in 0-100 range", 0.0 <= prob <= 100.0)
    print_check("Warning Notice Present", "EXPERIMENTAL" in data["warning_notice"])


def test_v2_fixed_input_regression():
    print("\n--- Test 3: V2 Fixed-Input Regression on Actual Recorded Outputs ---")
    # Case A: Guwahati Normal Stage (WL=42.0m, DL=49.68m) -> recorded output: pred=0, prob ~0.39%
    payload_a = {
        "latitude": 26.1947,
        "longitude": 91.7431,
        "rainfall": 0.0,
        "temperature": 28.5,
        "humidity": 65.0,
        "water_level": 42.0,
        "elevation": 44.0,
    }
    res_a = client.post("/predict/v2-experimental", json=payload_a).json()
    print_check("Case A: Prediction == 0", res_a["prediction"] == 0)
    print_check("Case A: Result Label", res_a["result"] == "Normal (No Danger Expected)")
    print_check("Case A: Recorded Prob (~0.39%)", abs(res_a["model_estimated_probability_percent"] - 0.39) < 0.1)

    # Case B: Guwahati Flood Stage (WL=50.2m > DL=49.68m, Rain=15mm) -> recorded output: pred=1, prob=66.00%
    payload_b = {
        "latitude": 26.1947,
        "longitude": 91.7431,
        "rainfall": 15.0,
        "temperature": 27.0,
        "humidity": 95.0,
        "water_level": 50.2,
        "elevation": 44.0,
    }
    res_b = client.post("/predict/v2-experimental", json=payload_b).json()
    print_check("Case B: Prediction == 1", res_b["prediction"] == 1)
    print_check("Case B: Result Label", res_b["result"] == "Flood Danger Warning")
    print_check("Case B: Recorded Prob (66.00%)", abs(res_b["model_estimated_probability_percent"] - 66.0) < 0.1)

    # Case C: Shimoga High Stage (WL=567.5m > DL=567.25m, Rain=20mm) -> recorded output: pred=1, prob ~71.69%
    payload_c = {
        "latitude": 13.9269,
        "longitude": 75.585,
        "rainfall": 20.0,
        "temperature": 24.0,
        "humidity": 90.0,
        "water_level": 567.5,
        "elevation": 560.0,
    }
    res_c = client.post("/predict/v2-experimental", json=payload_c).json()
    print_check("Case C: Prediction == 1", res_c["prediction"] == 1)
    print_check("Case C: Result Label", res_c["result"] == "Flood Danger Warning")
    print_check("Case C: Recorded Prob (~71.69%)", abs(res_c["model_estimated_probability_percent"] - 71.69) < 0.1)


def test_missing_or_invalid_inputs():
    print("\n--- Test 4: Missing and Invalid Inputs Produce HTTP 422 ---")
    # 4a. Missing required fields in V1 and V2
    incomplete_payload = {"latitude": 26.1947, "longitude": 91.7431}
    res_v1_missing = client.post("/predict", json=incomplete_payload)
    print_check("V1 Missing Fields -> 422", res_v1_missing.status_code == 422)

    res_v2_missing = client.post("/predict/v2-experimental", json=incomplete_payload)
    print_check("V2 Missing Fields -> 422", res_v2_missing.status_code == 422)

    # 4b. Invalid negative rainfall
    bad_rain = {
        "latitude": 26.1947, "longitude": 91.7431, "rainfall": -5.0,
        "temperature": 28.5, "humidity": 65.0, "water_level": 42.0, "elevation": 44.0
    }
    res_bad_rain = client.post("/predict/v2-experimental", json=bad_rain)
    print_check("Negative Rainfall -> 422", res_bad_rain.status_code == 422)

    # 4c. Invalid humidity (> 100%)
    bad_hum = {
        "latitude": 26.1947, "longitude": 91.7431, "rainfall": 10.0,
        "temperature": 28.5, "humidity": 150.0, "water_level": 42.0, "elevation": 44.0
    }
    res_bad_hum = client.post("/predict/v2-experimental", json=bad_hum)
    print_check("Humidity > 100% -> 422", res_bad_hum.status_code == 422)

    # 4d. Invalid elevation (<= -1.0 m, which causes division by zero in Elevation_Risk)
    bad_elev = {
        "latitude": 26.1947, "longitude": 91.7431, "rainfall": 10.0,
        "temperature": 28.5, "humidity": 80.0, "water_level": 42.0, "elevation": -1.0
    }
    res_bad_elev = client.post("/predict/v2-experimental", json=bad_elev)
    print_check("Elevation <= -1.0 m -> 422", res_bad_elev.status_code == 422)


def test_missing_v2_model_graceful_handling():
    print("\n--- Test 5: Missing V2 Model Returns 503 while V1 Remains Operational ---")
    valid_payload = {
        "latitude": 26.1947,
        "longitude": 91.7431,
        "rainfall": 0.0,
        "temperature": 28.5,
        "humidity": 65.0,
        "water_level": 42.0,
        "elevation": 44.0,
    }
    # Mock V2 model as unloaded
    with unittest.mock.patch.object(pred_service, "_model_v2_loaded", False), \
         unittest.mock.patch.object(pred_service, "_model_v2_error", "Mocked file missing"):
        res_v2 = client.post("/predict/v2-experimental", json=valid_payload)
        print_check("V2 Missing Model Status 503", res_v2.status_code == 503)
        print_check("V2 Informative Detail", "V2 experimental model is unavailable" in res_v2.json()["detail"])

        # V1 MUST remain operational
        res_v1 = client.post("/predict", json=valid_payload)
        print_check("V1 Remains Operational (Status 200)", res_v1.status_code == 200)


def test_experimental_endpoint_isolation_from_sensors_and_alerts():
    print("\n--- Test 6: Experimental Endpoint Isolation from State & Alerts ---")
    # Verify initial sensor state
    res_sensor_before = client.get("/sensor").json()
    res_alerts_before = client.get("/alerts").json()

    # Execute high-risk V2 prediction
    payload_flood = {
        "latitude": 26.1947,
        "longitude": 91.7431,
        "rainfall": 15.0,
        "temperature": 27.0,
        "humidity": 95.0,
        "water_level": 50.2,
        "elevation": 44.0,
    }
    res_v2 = client.post("/predict/v2-experimental", json=payload_flood)
    print_check("V2 Flood Call 200", res_v2.status_code == 200)

    # Verify sensor state unmodified
    res_sensor_after = client.get("/sensor").json()
    print_check("Sensor state unmodified", res_sensor_before == res_sensor_after)

    # Verify alerts unmodified
    res_alerts_after = client.get("/alerts").json()
    print_check("Alerts state unmodified", res_alerts_before == res_alerts_after)


if __name__ == "__main__":
    print("=" * 60)
    print("  RUNNING FLOODGUARD STAGE 5 INTEGRATION TEST SUITE")
    print("=" * 60)
    test_v1_production_endpoint_unmodified()
    test_v2_experimental_endpoint_schema_and_metadata()
    test_v2_fixed_input_regression()
    test_missing_or_invalid_inputs()
    test_missing_v2_model_graceful_handling()
    test_experimental_endpoint_isolation_from_sensors_and_alerts()
    print("\n" + "=" * 60)
    print("  ALL STAGE 5 INTEGRATION TESTS PASSED (6/6 SUITES)")
    print("=" * 60)
