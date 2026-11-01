"""
FloodGuard FastAPI – Test Suite
Tests all endpoints in order.
Run from project root:
    python backend/test_api.py
"""

import requests
import json

BASE = "http://127.0.0.1:8000"
PASS = "[PASS]"
FAIL = "[FAIL]"


def sep(title):
    print()
    print("=" * 60)
    print(f"  {title}")
    print("=" * 60)


def check(cond, msg):
    print(f"  {PASS if cond else FAIL} {msg}")


# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 1: GET / (root health check)")
r = requests.get(BASE + "/", timeout=5)
print(f"  Status: {r.status_code}")
print(f"  Body:   {r.json()}")
check(r.status_code == 200 and r.json().get("status") == "ok", "Root endpoint OK")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 2: GET /health (detailed health + model_loaded)")
r = requests.get(BASE + "/health", timeout=5)
print(f"  Status: {r.status_code}")
d = r.json()
print(f"  Body:   {json.dumps(d, indent=4)}")
model_loaded = d.get("model_loaded", False)
check(model_loaded, f"model_loaded = {model_loaded}")
check(d.get("api") == "FastAPI", "api = FastAPI")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 3: GET /sensor (no data yet)")
r = requests.get(BASE + "/sensor", timeout=5)
print(f"  Status: {r.status_code}")
d = r.json()
print(f"  Body:   {d}")
check(r.status_code == 200 and d.get("connected") is False, "connected=false before POST")
check(d.get("data") is None, "data=null before POST")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 4: POST /sensor (receive ESP32 data)")
sensor_payload = {
    "temperature": 28.5,
    "humidity":    75.0,
    "rainfall":    12.0,
    "water_level": 1.8,
}
r = requests.post(BASE + "/sensor", json=sensor_payload, timeout=5)
print(f"  Status: {r.status_code}")
d = r.json()
print(f"  Body:   {json.dumps(d, indent=4)}")
check(r.status_code == 200 and d.get("success") is True, "POST /sensor accepted")
check(d.get("data", {}).get("temperature") == 28.5, "temperature stored = 28.5")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 5: GET /sensor (after posting – should show real data)")
r = requests.get(BASE + "/sensor", timeout=5)
print(f"  Status: {r.status_code}")
d = r.json()
print(f"  Body:   {json.dumps(d, indent=4)}")
data = d.get("data", {})
check(d.get("connected") is True, "connected=true after POST")
check(data.get("temperature") == 28.5, "temperature = 28.5")
check(data.get("humidity")    == 75.0, "humidity    = 75.0")
check(data.get("rainfall")    == 12.0, "rainfall    = 12.0")
check(data.get("water_level") == 1.8,  "water_level = 1.8")
check("timestamp" in d, "timestamp present")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 6: POST /sensor/disconnect")
r = requests.post(BASE + "/sensor/disconnect", timeout=5)
print(f"  Status: {r.status_code}")
d = r.json()
print(f"  Body:   {d}")
check(r.status_code == 200 and d.get("status") == "disconnected", "Disconnect OK")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 7: GET /sensor after disconnect")
r = requests.get(BASE + "/sensor", timeout=5)
d = r.json()
print(f"  Body:   {d}")
check(d.get("connected") is False, "connected=false after disconnect")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 8: POST /predict")
pred_payload = {
    "latitude":    22.30,
    "longitude":   82.50,
    "rainfall":    200.0,
    "temperature": 28.0,
    "humidity":    80.0,
    "water_level": 7.0,
    "elevation":   500.0,
}
r = requests.post(BASE + "/predict", json=pred_payload, timeout=15)
print(f"  Status: {r.status_code}")
d = r.json()
print(f"  Body:   {d}")
check(r.status_code == 200, "Prediction HTTP 200")
check("prediction" in d, "prediction field present")
check("result" in d, "result field present")
check(d.get("prediction") in (0, 1), f"prediction is 0 or 1 (got {d.get('prediction')})")
if "result" in d:
    print(f"  Model output: prediction={d['prediction']} => {d['result']}")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 9: GET /docs (Swagger UI)")
r = requests.get(BASE + "/docs", timeout=5)
print(f"  Status: {r.status_code}")
check(r.status_code == 200, "Swagger UI accessible at /docs")

# ─────────────────────────────────────────────────────────────────────────────
sep("TEST 10: POST /predict – missing field validation")
bad_payload = {"latitude": 22.30, "longitude": 82.50}  # missing 5 fields
r = requests.post(BASE + "/predict", json=bad_payload, timeout=5)
print(f"  Status: {r.status_code}")
check(r.status_code == 422, "Pydantic validation returns 422 for missing fields")

print()
print("=" * 60)
print("  ALL TESTS COMPLETE")
print("=" * 60)
print()
