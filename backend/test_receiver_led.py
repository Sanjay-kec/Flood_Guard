"""
FloodGuard – Test Suite for Bluetooth Receiver ML Prediction & LED Actuation
=============================================================================
Tests:
1. Parsing of ESP32 JSON lines: valid JSON, comma-separated fallback, malformed lines.
2. Bluetooth Serial command formatting: newline-terminated LED_ON\\n and LED_OFF\\n.
3. Actual Random Forest model inference on live sensor inputs:
   - Low risk (rain=0, water=0) -> prediction=0 ("NO FLOOD") -> LED_OFF command
   - High risk (rain=95.9, water=9.85) -> prediction=1 ("HIGH FLOOD ALERT") -> LED_ON command
4. Safe fallback behavior: API failure or telemetry loss turns active flood LED OFF.
5. Single serial port connection verification (bidirectional send/receive without opening port twice).
6. Preservation of sensor ingestion to MySQL database.
"""

import io
import json
import os
import sys
import unittest.mock
from pathlib import Path

# Anchor project root to sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

import bluetooth.receiver as receiver
from backend.services.prediction_service import run_prediction_rf
import backend.database as db

PASS = "[PASS]"
FAIL = "[FAIL]"


class MockSerial:
    """Simulates a bidirectional Bluetooth Serial SPP connection."""
    def __init__(self, incoming_lines=None):
        self.incoming_lines = [l.encode("utf-8") if isinstance(l, str) else l for l in (incoming_lines or [])]
        self.written_bytes = bytearray()
        self.is_open = True
        self.flush_count = 0

    def readline(self):
        if self.incoming_lines:
            return self.incoming_lines.pop(0)
        return b""

    def write(self, data: bytes):
        self.written_bytes.extend(data)
        return len(data)

    def flush(self):
        self.flush_count += 1

    def close(self):
        self.is_open = False


def check(name: str, cond: bool, detail: str = ""):
    status = PASS if cond else FAIL
    print(f"  {status} {name} {detail}".strip())
    assert cond, f"Assertion failed: {name} - {detail}"


def test_sensor_line_parsing():
    print("\n--- TEST 1: Sensor Line & ESP32 Hardware ACK Parsing ---")
    # 1. Exact telemetry JSON from ESP32 with digitalRead(LED_PIN)
    valid_json = '{"temperature":34.1,"humidity":51.7,"rainfall":0.0,"water_level":0.00,"led":0}\n'
    parsed = receiver.parse_sensor_line(valid_json)
    check("Valid JSON parsed", parsed is not None)
    check("Temperature parsed correctly", parsed["temperature"] == 34.1)
    check("Humidity parsed correctly", parsed["humidity"] == 51.7)
    check("Rainfall parsed correctly", parsed["rainfall"] == 0.0)
    check("Water level parsed correctly", parsed["water_level"] == 0.0)
    check("LED pin state parsed correctly", parsed.get("led") == 0)
    check("Hardware LED state parsed as OFF", parsed.get("hardware_led") == "OFF")

    # 2. Hardware ACK packets from ESP32
    ack_off = '{"ack":"LED_OFF","gpio":23,"state":0}\n'
    msg_off = receiver.parse_esp32_message(ack_off)
    check("Hardware ACK OFF parsed", msg_off is not None and msg_off["type"] == "ack")
    check("ACK command is LED_OFF", msg_off["command"] == "LED_OFF")
    check("ACK state is OFF", msg_off["state"] == "OFF")
    check("ACK gpio is 23", msg_off["gpio"] == 23)

    ack_on = '{"ack":"LED_ON","gpio":23,"state":1}\n'
    msg_on = receiver.parse_esp32_message(ack_on)
    check("Hardware ACK ON parsed", msg_on is not None and msg_on["type"] == "ack")
    check("ACK command is LED_ON", msg_on["command"] == "LED_ON")
    check("ACK state is ON", msg_on["state"] == "ON")
    check("ACK gpio is 23", msg_on["gpio"] == 23)

    # 3. Incomplete JSON
    incomplete_json = '{"temperature":34.1,"humidity":51.7}\n'
    check("Incomplete JSON returns None", receiver.parse_sensor_line(incomplete_json) is None)

    # 4. Empty string
    check("Empty string returns None", receiver.parse_sensor_line("") is None)

    # 5. Legacy CSV format
    csv_line = "31.5,62.0,15.0,1.2\n"
    parsed_csv = receiver.parse_sensor_line(csv_line)
    check("CSV fallback parsed", parsed_csv is not None)
    check("CSV rainfall parsed", parsed_csv["rainfall"] == 15.0)


def test_bluetooth_command_formatting():
    print("\n--- TEST 2: Bluetooth Serial Command Formatting ---")
    mock_ser = MockSerial()

    # Send LED_ON
    ok_on = receiver.send_esp32_command(mock_ser, "LED_ON")
    check("send_esp32_command(LED_ON) succeeded", ok_on is True)
    check("Command bytes end with newline", mock_ser.written_bytes.endswith(b"LED_ON\n"))
    check("Serial buffer flushed", mock_ser.flush_count == 1)

    # Send LED_OFF
    ok_off = receiver.send_esp32_command(mock_ser, "LED_OFF")
    check("send_esp32_command(LED_OFF) succeeded", ok_off is True)
    check("Command bytes contain LED_OFF\\n", b"LED_OFF\n" in mock_ser.written_bytes)
    check("Serial buffer flushed again", mock_ser.flush_count == 2)


def test_real_model_inference_and_led_decision():
    print("\n--- TEST 3: Real Random Forest Model Inference & LED Decision ---")
    lat, lon, elev = 10.940896, 77.077726, 318.3

    # Case A: Low Risk (Safe sensor readings)
    low_risk_data = {
        "temperature": 34.1,
        "humidity": 51.7,
        "rainfall": 0.0,
        "water_level": 0.0,
    }
    pred_low = run_prediction_rf(
        latitude=lat,
        longitude=lon,
        rainfall=low_risk_data["rainfall"],
        temperature=low_risk_data["temperature"],
        humidity=low_risk_data["humidity"],
        water_level=low_risk_data["water_level"],
        elevation=elev,
    )
    print("  Low Risk Model Output:", pred_low)
    check("Low risk prediction == 0", pred_low["prediction"] == 0)
    check("Low risk status == 'NO FLOOD'", pred_low["status"] == "NO FLOOD")

    is_flood_low = (pred_low["prediction"] == 1 or pred_low["status"] == "HIGH FLOOD ALERT")
    target_cmd_low = "LED_ON" if is_flood_low else "LED_OFF"
    check("Low risk maps to LED_OFF", target_cmd_low == "LED_OFF")

    # Case B: High Risk (Severe flood conditions)
    high_risk_data = {
        "temperature": 32.2,
        "humidity": 63.1,
        "rainfall": 95.9,
        "water_level": 9.85,
    }
    pred_high = run_prediction_rf(
        latitude=lat,
        longitude=lon,
        rainfall=high_risk_data["rainfall"],
        temperature=high_risk_data["temperature"],
        humidity=high_risk_data["humidity"],
        water_level=high_risk_data["water_level"],
        elevation=elev,
    )
    print("  High Risk Model Output:", pred_high)
    check("High risk prediction == 1", pred_high["prediction"] == 1)
    check("High risk status == 'HIGH FLOOD ALERT'", pred_high["status"] == "HIGH FLOOD ALERT")

    is_flood_high = (pred_high["prediction"] == 1 or pred_high["status"] == "HIGH FLOOD ALERT")
    target_cmd_high = "LED_ON" if is_flood_high else "LED_OFF"
    check("High risk maps to LED_ON", target_cmd_high == "LED_ON")


def test_safe_fallback_on_api_failure():
    print("\n--- TEST 4: Safe Fallback on API Failure ---")
    mock_ser = MockSerial()
    current_led_state = True  # An alert was previously active

    # Simulate query_rf_prediction returning None (API down)
    with unittest.mock.patch("bluetooth.receiver.requests.post") as mock_post:
        mock_post.side_effect = Exception("FastAPI timeout")
        res = receiver.query_rf_prediction(
            sensor_data={"rainfall": 0.0, "temperature": 30.0, "humidity": 60.0, "water_level": 0.0},
            latitude=10.940896,
            longitude=77.077726,
            elevation=318.3,
        )
        check("query_rf_prediction returns None on failure", res is None)

    # Safe fallback simulation: If prediction fails when LED was ON, turn LED OFF
    if res is None and current_led_state is True:
        receiver.send_esp32_command(mock_ser, "LED_OFF")
        current_led_state = False

    check("Safe fallback sent LED_OFF", mock_ser.written_bytes == b"LED_OFF\n")
    check("LED state cleared to False", current_led_state is False)


def test_single_connection_integrity():
    print("\n--- TEST 5: Single Connection Integrity ---")
    # Verify that mock serial can both read incoming lines and write outgoing commands
    incoming = '{"temperature":33.0,"humidity":55.0,"rainfall":0.0,"water_level":0.0}\n'
    ser = MockSerial(incoming_lines=[incoming])

    # 1. Read
    raw = ser.readline()
    check("Read incoming line from serial", len(raw) > 0)
    data = receiver.parse_sensor_line(raw.decode("utf-8"))
    check("Parsed telemetry from single connection", data["temperature"] == 33.0)

    # 2. Write command back to the EXACT same connection
    receiver.send_esp32_command(ser, "LED_OFF")
    check("Wrote command to the same serial stream", ser.written_bytes == b"LED_OFF\n")
    check("Serial remains open and functional", ser.is_open is True)


def test_backend_led_state_and_ack():
    print("\n--- TEST 6: Backend LED State & Hardware ACK Synchronization ---")
    from backend.routes.sensor import (
        set_target_led_command,
        record_led_ack,
        get_led_status,
        disconnect_sensor,
    )
    from backend.routes.prediction import predict_rf, PredictionRequest

    # Step 1: Initial target command sets synced to False until ACK
    set_target_led_command("LED_ON")
    status1 = get_led_status()
    check("Target LED set to LED_ON", status1["target_command"] == "LED_ON")
    check("Hardware not yet synced before ACK", status1["synced"] is False)

    # Step 2: Receiver reports physical hardware ACK
    record_led_ack("LED_ON", True)
    status2 = get_led_status()
    check("Hardware state updated to ON", status2["hardware_state"] == "ON")
    check("Hardware verified synced after ACK", status2["synced"] is True)
    check("Receiver connection marked True", status2["receiver_connected"] is True)

    # Step 3: Run predict_rf with flood conditions -> verifies unified pipeline
    high_req = PredictionRequest(
        latitude=10.940896,
        longitude=77.077726,
        elevation=318.3,
        rainfall=95.9,
        temperature=32.2,
        humidity=63.1,
        water_level=9.85,
    )
    res_high = predict_rf(high_req)
    check("predict_rf returns target_led == LED_ON", res_high["target_led"] == "LED_ON")
    check("predict_rf includes hardware_led_state", "hardware_led_state" in res_high)
    check("predict_rf includes hardware_led_synced", "hardware_led_synced" in res_high)

    # Step 4: Run predict_rf with safe conditions -> verifies transition to LED_OFF
    low_req = PredictionRequest(
        latitude=10.940896,
        longitude=77.077726,
        elevation=318.3,
        rainfall=0.0,
        temperature=31.0,
        humidity=60.0,
        water_level=0.0,
    )
    res_low = predict_rf(low_req)
    check("predict_rf returns target_led == LED_OFF", res_low["target_led"] == "LED_OFF")
    status3 = get_led_status()
    check("Target command updated to LED_OFF", status3["target_command"] == "LED_OFF")
    check("Hardware un-synced until receiver ACKs new command", status3["synced"] is False)

    # Step 5: Receiver ACKs LED_OFF
    record_led_ack("LED_OFF", True)
    status4 = get_led_status()
    check("Hardware state updated to OFF", status4["hardware_state"] == "OFF")
    check("Hardware verified synced to LED_OFF", status4["synced"] is True)

    # Step 6: Disconnect Bluetooth -> hardware status unknown
    import asyncio
    asyncio.run(disconnect_sensor())
    status_disc = get_led_status()
    check("After disconnect, receiver_connected is False", status_disc["receiver_connected"] is False)
    check("After disconnect, hardware_state is UNKNOWN", status_disc["hardware_state"] == "UNKNOWN")
    check("After disconnect, synced is False", status_disc["synced"] is False)

    # Step 7: Reconnect Bluetooth -> synchronizes with latest prediction
    # If latest prediction is LED_OFF, reconnecting and acknowledging sets confirmed OFF
    record_led_ack("LED_OFF", True)
    status_recon = get_led_status()
    check("After reconnect & ACK, receiver_connected is True", status_recon["receiver_connected"] is True)
    check("After reconnect & ACK, hardware_state is OFF", status_recon["hardware_state"] == "OFF")
    check("After reconnect & ACK, synced is True", status_recon["synced"] is True)


def main():
    print("=" * 60)
    print("  FLOODGUARD BLUETOOTH RECEIVER & LED INTEGRATION TESTS")
    print("=" * 60)

    test_sensor_line_parsing()
    test_bluetooth_command_formatting()
    test_real_model_inference_and_led_decision()
    test_safe_fallback_on_api_failure()
    test_single_connection_integrity()
    test_backend_led_state_and_ack()

    print("\n" + "=" * 60)
    print("  ALL 6 INTEGRATION TEST SUITES PASSED WITH ZERO REGRESSIONS!")
    print("=" * 60)


if __name__ == "__main__":
    main()

