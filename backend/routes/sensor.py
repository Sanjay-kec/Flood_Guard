"""
FloodGuard – Sensor Routes
===========================
Handles POST /sensor (receive ESP32 data from Bluetooth receiver),
GET /sensor (React frontend polling), and POST /sensor/disconnect.

ESP32 sends ONLY: temperature, humidity, rainfall, water_level
(No GPS — latitude/longitude/elevation are NOT from ESP32)
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from datetime import datetime
from backend.database import insert_sensor_reading

router = APIRouter()

# ── In-memory sensor data store ───────────────────────────────────────────────
# Holds the latest reading pushed by the Bluetooth receiver script.
_latest_sensor: dict = {
    "temperature": None,
    "humidity":    None,
    "rainfall":    None,
    "water_level": None,
    "timestamp":   None,
    "connected":   False,
}

# ── In-memory physical LED state store ─────────────────────────────────────────
# Tracks the ML prediction target command and verified hardware ACK synchronization.
_led_state: dict = {
    "target_command": "LED_OFF",        # "LED_ON" | "LED_OFF"
    "hardware_state": "UNKNOWN",        # "ON" | "OFF" | "UNKNOWN"
    "synced": False,                    # True ONLY when hardware ACK matches target_command and is fresh
    "receiver_connected": False,        # True when Bluetooth receiver is communicating
    "hardware_ack_received": False,     # True only when verified ESP32 ACK packet arrived
    "last_ack_timestamp": None,         # Timestamp of last verified hardware ACK from ESP32
    "last_command_timestamp": None,     # Timestamp of last prediction target_command
    "last_gpio": 23,
}


def set_target_led_command(command: str):
    """
    Called by prediction endpoints to set the desired LED state based on ML prediction.
    Marks synced=False until the ESP32 confirms execution on physical GPIO 23.
    """
    cmd = command.strip().upper()
    if cmd in ("LED_ON", "LED_OFF"):
        _led_state["target_command"] = cmd
        _led_state["last_command_timestamp"] = datetime.now().isoformat()
        expected_state = "ON" if cmd == "LED_ON" else "OFF"
        # If confirmed hardware state differs from new target, it is not yet synced!
        if _led_state["hardware_state"] != expected_state:
            _led_state["synced"] = False


def record_hardware_ack(command: str, actual_state: str, gpio: int = 23, success: bool = True):
    """
    Called ONLY when a verified hardware ACK line or telemetry reading with 'led'
    is received from the physical ESP32.
    """
    _led_state["receiver_connected"] = True
    cmd = command.strip().upper()
    state = actual_state.strip().upper()

    if success and state in ("ON", "OFF"):
        _led_state["hardware_state"] = state
        _led_state["hardware_ack_received"] = True
        _led_state["last_gpio"] = gpio
        _led_state["last_ack_timestamp"] = datetime.now().isoformat()
        expected = "ON" if _led_state["target_command"] == "LED_ON" else "OFF"
        _led_state["synced"] = (state == expected)
    elif state == "UNKNOWN":
        _led_state["hardware_state"] = "UNKNOWN"
        _led_state["synced"] = False


def record_led_ack(command: str, success: bool = True, actual_state: str = None, gpio: int = 23):
    """Backwards-compatible wrapper for record_hardware_ack."""
    if actual_state is None:
        actual_state = "ON" if command.strip().upper() == "LED_ON" else "OFF"
    record_hardware_ack(command=command, actual_state=actual_state, gpio=gpio, success=success)


def get_led_status() -> dict:
    """
    Returns the verified LED actuation state and hardware synchronization status.
    Enforces that missing or outdated acknowledgments (> 15 seconds) report UNKNOWN / unsynced.
    """
    now = datetime.now()

    if not _led_state["receiver_connected"]:
        return {
            "target_command": _led_state["target_command"],
            "hardware_state": "UNKNOWN",
            "synced": False,
            "receiver_connected": False,
            "last_ack_timestamp": _led_state["last_ack_timestamp"],
            "last_command_timestamp": _led_state["last_command_timestamp"],
            "last_gpio": _led_state.get("last_gpio", 23),
        }

    # Verify ACK freshness (must have received an ACK within the last 15 seconds)
    last_ack = _led_state.get("last_ack_timestamp")
    is_ack_fresh = False
    if last_ack:
        try:
            ack_dt = datetime.fromisoformat(last_ack)
            if (now - ack_dt).total_seconds() <= 15:
                is_ack_fresh = True
        except Exception:
            pass

    if not is_ack_fresh:
        return {
            "target_command": _led_state["target_command"],
            "hardware_state": "UNKNOWN",
            "synced": False,
            "receiver_connected": True,
            "last_ack_timestamp": _led_state["last_ack_timestamp"],
            "last_command_timestamp": _led_state["last_command_timestamp"],
            "last_gpio": _led_state.get("last_gpio", 23),
        }

    expected_state = "ON" if _led_state["target_command"] == "LED_ON" else "OFF"
    is_synced = (_led_state["hardware_state"] == expected_state)

    return {
        "target_command": _led_state["target_command"],
        "hardware_state": _led_state["hardware_state"],
        "synced": is_synced,
        "receiver_connected": True,
        "last_ack_timestamp": _led_state["last_ack_timestamp"],
        "last_command_timestamp": _led_state["last_command_timestamp"],
        "last_gpio": _led_state.get("last_gpio", 23),
    }


def get_sensor_status() -> dict:
    """Returns current sensor connection flag and last reading timestamp."""
    return {
        "connected": bool(_latest_sensor.get("connected", False)),
        "timestamp": _latest_sensor.get("timestamp"),
    }


# ── Pydantic models for Sensor Routes ─────────────────────────────────────────

class SensorData(BaseModel):
    """
    Readings from the ESP32 via Bluetooth.
    Includes optional physical LED output pin confirmation (GPIO 23).
    """
    temperature: float
    humidity:    float
    rainfall:    float
    water_level: float
    led:         int | None = None   # 0 = LOW, 1 = HIGH (from digitalRead(LED_PIN))


class LedAckPayload(BaseModel):
    """Payload sent by bluetooth/receiver.py upon receiving a hardware ACK from ESP32."""
    command: str = Field(..., description="LED_ON or LED_OFF")
    actual_state: str = Field(..., description="Confirmed pin output state: ON, OFF, or UNKNOWN")
    gpio: int = Field(23, description="ESP32 GPIO pin number")
    success: bool = Field(True, description="True if Bluetooth ACK received")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/sensor", tags=["Sensor"], summary="Receive ESP32 sensor data")
async def post_sensor(data: SensorData):
    """
    Called by the Python Bluetooth receiver (bluetooth/receiver.py) each time
    a new reading arrives from the ESP32.

    Expected JSON:
        { "temperature": 28.5, "humidity": 75.0, "rainfall": 12.0, "water_level": 1.8 }

    Returns latest target LED command so receiver can immediately synchronize hardware.
    """
    _latest_sensor["temperature"] = data.temperature
    _latest_sensor["humidity"]    = data.humidity
    _latest_sensor["rainfall"]    = data.rainfall
    _latest_sensor["water_level"] = data.water_level
    _latest_sensor["timestamp"]   = datetime.now().isoformat()
    _latest_sensor["connected"]   = True
    _led_state["receiver_connected"] = True

    # Persist to MySQL database
    try:
        insert_sensor_reading(
            temperature=data.temperature,
            humidity=data.humidity,
            rainfall=data.rainfall,
            water_level=data.water_level,
            timestamp=_latest_sensor["timestamp"],
        )
    except Exception as exc:
        print(f"[Sensor] [DB ERROR] Failed to save sensor reading: {exc}")

    # If the ESP32 telemetry packet includes verified hardware pin state (digitalRead(LED_PIN))
    if data.led is not None:
        pin_state = "ON" if data.led == 1 else "OFF"
        record_hardware_ack(
            command=_led_state["target_command"],
            actual_state=pin_state,
            gpio=23,
            success=True,
        )

    print(
        f"[Sensor] {_latest_sensor['timestamp']} | "
        f"Temp={data.temperature}°C | Humidity={data.humidity}% | "
        f"Rainfall={data.rainfall}mm | WaterLevel={data.water_level}m | "
        f"PinLED={'ON' if data.led == 1 else 'OFF' if data.led == 0 else 'N/A'} | "
        f"TargetLED={_led_state['target_command']} | Synced={_led_state['synced']}"
    )

    return {
        "success": True,
        "data": {
            "temperature": data.temperature,
            "humidity":    data.humidity,
            "rainfall":    data.rainfall,
            "water_level": data.water_level,
        },
        "target_led": _led_state["target_command"],
        "led_status": get_led_status(),
    }


@router.get("/sensor", tags=["Sensor"], summary="Get latest ESP32 sensor data")
async def get_sensor():
    """
    React frontend polls this every 2 seconds.

    Returns:
        - { "connected": false, "data": null, "led_status": {...} } when no ESP32 data has arrived
        - { "connected": true, "data": {...}, "timestamp": "...", "led_status": {...} } when connected
    """
    led_info = get_led_status()
    if not _latest_sensor["connected"] or _latest_sensor["timestamp"] is None:
        return JSONResponse(
            status_code=200,
            content={
                "connected": False,
                "data": None,
                "led_status": led_info,
            }
        )

    return {
        "connected":   True,
        "data": {
            "temperature": _latest_sensor["temperature"],
            "humidity":    _latest_sensor["humidity"],
            "rainfall":    _latest_sensor["rainfall"],
            "water_level": _latest_sensor["water_level"],
        },
        "timestamp": _latest_sensor["timestamp"],
        "led_status": led_info,
    }


@router.post("/sensor/led-ack", tags=["Sensor"], summary="Record receiver hardware LED acknowledgment")
async def post_led_ack(payload: LedAckPayload):
    """
    Called by bluetooth/receiver.py upon receiving verified hardware ACK from ESP32.
    Enforces truthful hardware confirmation before the UI indicates LED status.
    """
    record_hardware_ack(
        command=payload.command,
        actual_state=payload.actual_state,
        gpio=payload.gpio,
        success=payload.success,
    )
    return {
        "success": True,
        "led_status": get_led_status(),
    }


@router.get("/sensor/led-status", tags=["Sensor"], summary="Get physical LED synchronization status")
async def get_led_status_route():
    """Returns the verified LED actuation state and hardware synchronization status."""
    return get_led_status()


@router.post(
    "/sensor/disconnect",
    tags=["Sensor"],
    summary="Mark ESP32 as disconnected"
)
async def disconnect_sensor():
    """
    Called by the Bluetooth receiver when the ESP32 connection is lost.
    After this, GET /sensor returns { connected: false, data: null }.
    Hardware status is marked UNKNOWN and unsynced.
    """
    _latest_sensor["connected"] = False
    _led_state["receiver_connected"] = False
    _led_state["hardware_state"] = "UNKNOWN"
    _led_state["synced"] = False
    _led_state["last_ack_timestamp"] = None
    print("[Sensor] ESP32 disconnected -> Hardware status marked UNKNOWN")
    return {"status": "disconnected", "led_status": get_led_status()}


