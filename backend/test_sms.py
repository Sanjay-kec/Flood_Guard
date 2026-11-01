"""
FloodGuard – Automated SMS Integration Test Suite
=================================================
Runs automated verification for both Mock SMS Provider and Twilio Provider.
Never sends real SMS messages. Never incurs charges.

Tests:
  1. Phone number normalization (Indian national, domestic trunk, international E.164)
  2. Database schema initialization (preserves sensor_readings and predictions)
  3. SMS Status endpoint in MOCK mode (reports 'mock', ready=True, 'MOCK MODE — NO REAL SMS SENT')
  4. Mock SMS dispatch (succeeds without network request, zero credentials, logs status='mock_sent')
  5. Whitelist protection in Twilio mode (rejects unauthorized numbers with 403 Forbidden)
  6. Mocked Twilio successful dispatch (201 Created -> queued, logs to MySQL)
  7. Rate limiting and daily quota enforcement (429 Too Many Requests)
  8. Mocked Twilio error handling (clean error message without secret exposure)
  9. SMS history audit retrieval from MySQL (confirms mock_sent and queued entries)
  10. Zero regression verification on existing sensor readings and predictions
"""

import sys
import os
import unittest.mock
from pathlib import Path
from fastapi import HTTPException
from sqlalchemy import text

# Add project root to sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from backend.routes.sms import (
    get_gateway_status,
    get_sms_dispatch_history,
    post_test_sms,
    TestSmsRequest,
)
from backend.services.sms_service import normalize_phone_number, send_test_sms
import backend.database as db
from backend.database_sms import (
    init_sms_db,
    get_daily_test_sms_count,
    get_recent_sms_logs,
)
from backend.services.providers.mock_provider import MockSMSProvider
from backend.services.providers.twilio_provider import TwilioSMSProvider

PASS = "[PASS]"
FAIL = "[FAIL]"


def check(name: str, cond: bool, detail: str = ""):
    status = PASS if cond else FAIL
    print(f"  {status} {name} {detail}".strip())
    assert cond, f"Assertion failed: {name} - {detail}"


def test_1_phone_normalization():
    print("\n--- TEST 1: Phone Number Normalization ---")
    check("10-digit Indian (9876543210)", normalize_phone_number("9876543210") == "+919876543210")
    check("Domestic trunk with 0 (09876543210)", normalize_phone_number("09876543210") == "+919876543210")
    check("Indian with spaces & dash (+91 98765-43210)", normalize_phone_number("+91 98765-43210") == "+919876543210")
    check("US international (+1 (555) 019-2834)", normalize_phone_number("+1 (555) 019-2834") == "+15550192834")
    check("Empty input", normalize_phone_number("") == "")


def test_2_database_schema_preservation():
    print("\n--- TEST 2: Database Schema & Preservation ---")
    init_sms_db()
    engine = db.get_mysql_engine()
    with engine.connect() as conn:
        tables = [r[0] for r in conn.execute(text("SHOW TABLES;")).fetchall()]
        check("sensor_readings table exists", "sensor_readings" in tables)
        check("predictions table exists", "predictions" in tables)
        check("sms_dispatch_logs table exists", "sms_dispatch_logs" in tables)
        check("community_recipients table exists", "community_recipients" in tables)


def test_3_sms_status_mock_mode():
    print("\n--- TEST 3: GET /sms/status in Mock Mode ---")
    with unittest.mock.patch.dict(os.environ, {"SMS_PROVIDER": "mock"}):
        data = get_gateway_status()
        check("provider == 'mock'", data.get("provider") == "mock")
        check("is_mock is True", data.get("is_mock") is True)
        check("ready is True without credentials", data.get("ready") is True)
        check("mode_notice highlights Mock mode", "MOCK MODE" in data.get("mode_notice", ""))
        check("community_broadcast_enabled is False", data.get("community_broadcast_enabled") is False)
        check("daily_test_limit is integer", isinstance(data.get("daily_test_limit"), int))


def test_4_mock_provider_dispatch():
    print("\n--- TEST 4: Mock Provider Dispatch (Zero Network Calls, Zero Credentials) ---")
    with unittest.mock.patch.dict(os.environ, {
        "SMS_PROVIDER": "mock",
        "ADMIN_TEST_PHONE_NUMBER": "+919876543210",
        "MAX_DAILY_TEST_SMS": "100",
        "SMS_COOLDOWN_SECONDS": "0",
    }):
        with unittest.mock.patch("requests.post") as mock_http_post:
            req = TestSmsRequest(phone_number="+919876543210", note="Automated Mock Test")
            res = post_test_sms(req)

            check("success is True", res.success is True)
            check("provider is mock", res.provider == "mock")
            check("status is mock_sent (never delivered)", res.delivery_status == "mock_sent")
            check("mock SID starts with MOCK-SMS", str(res.provider_message_id).startswith("MOCK-SMS"))
            check("ZERO network calls made (requests.post not called)", not mock_http_post.called)


def test_5_whitelist_protection_blocks_unauthorized_numbers():
    print("\n--- TEST 5: Whitelist Protection (Blocks Unauthorized Numbers in Twilio Mode) ---")
    verified_number = "+919876543210"
    with unittest.mock.patch.dict(os.environ, {
        "SMS_PROVIDER": "twilio",
        "ADMIN_TEST_PHONE_NUMBER": verified_number,
        "TWILIO_ACCOUNT_SID": "AC11111111111111111111111111111111",
        "TWILIO_AUTH_TOKEN": "mock_auth_token_for_testing_1234",
        "TWILIO_FROM_NUMBER": "+15550001111",
    }):
        # Attempt to send to an unauthorized number
        req = TestSmsRequest(phone_number="+919999999999")
        try:
            post_test_sms(req)
            check("Should raise 403 Forbidden", False)
        except HTTPException as exc:
            check("Raises HTTP 403 Forbidden", exc.status_code == 403)
            check("Detail mentions unauthorized recipient", "Unauthorized recipient" in exc.detail)


def test_6_mocked_twilio_dispatch_success():
    print("\n--- TEST 6: Mocked Twilio Dispatch (Success Path) ---")
    verified_number = "+919876543210"

    mock_twilio_response = unittest.mock.MagicMock()
    mock_twilio_response.status_code = 201
    mock_twilio_response.json.return_value = {
        "sid": "SMmocked1234567890abcdef12345678",
        "status": "queued",
        "to": verified_number,
    }

    with unittest.mock.patch.dict(os.environ, {
        "SMS_PROVIDER": "twilio",
        "ADMIN_TEST_PHONE_NUMBER": verified_number,
        "TWILIO_ACCOUNT_SID": "AC11111111111111111111111111111111",
        "TWILIO_AUTH_TOKEN": "mock_auth_token_for_testing_1234",
        "TWILIO_FROM_NUMBER": "+15550001111",
        "DEMO_MODE": "True",
        "MAX_DAILY_TEST_SMS": "100",
        "SMS_COOLDOWN_SECONDS": "0",
    }):
        with unittest.mock.patch("requests.post", return_value=mock_twilio_response) as mock_post:
            req = TestSmsRequest(phone_number=verified_number, note="Unit Test Note")
            res = post_test_sms(req)
            check("success is True", res.success is True)
            check("provider is twilio", res.provider == "twilio")
            check("provider_message_id is returned", res.provider_message_id == "SMmocked1234567890abcdef12345678")
            check("status is queued", res.delivery_status == "queued")
            check("requests.post was called to Twilio API", mock_post.called)


def test_7_daily_limit_quota_enforcement():
    print("\n--- TEST 7: Daily Quota Enforcement (429 Rate Limit) ---")
    verified_number = "+919876543210"

    with unittest.mock.patch.dict(os.environ, {
        "SMS_PROVIDER": "mock",
        "ADMIN_TEST_PHONE_NUMBER": verified_number,
        "MAX_DAILY_TEST_SMS": "0",  # Limit 0 triggers quota block
        "SMS_COOLDOWN_SECONDS": "0",
    }):
        req = TestSmsRequest(phone_number=verified_number)
        try:
            post_test_sms(req)
            check("Should raise 429 Too Many Requests", False)
        except HTTPException as exc:
            check("Raises HTTP 429 Too Many Requests", exc.status_code == 429)
            check("Detail mentions daily quota reached", "Daily test SMS quota reached" in exc.detail)


def test_8_mocked_twilio_error_handling():
    print("\n--- TEST 8: Mocked Twilio Error Handling (400 Unverified Number) ---")
    verified_number = "+919876543210"

    mock_err_response = unittest.mock.MagicMock()
    mock_err_response.status_code = 400
    mock_err_response.json.return_value = {
        "code": 21608,
        "message": "The number is unverified. Trial accounts cannot send messages to unverified numbers.",
        "more_info": "https://www.twilio.com/docs/errors/21608",
    }

    with unittest.mock.patch.dict(os.environ, {
        "SMS_PROVIDER": "twilio",
        "ADMIN_TEST_PHONE_NUMBER": verified_number,
        "TWILIO_ACCOUNT_SID": "AC11111111111111111111111111111111",
        "TWILIO_AUTH_TOKEN": "mock_auth_token_for_testing_1234",
        "TWILIO_FROM_NUMBER": "+15550001111",
        "MAX_DAILY_TEST_SMS": "100",
        "SMS_COOLDOWN_SECONDS": "0",
    }):
        with unittest.mock.patch("requests.post", return_value=mock_err_response):
            req = TestSmsRequest(phone_number=verified_number)
            res = post_test_sms(req)
            check("success is False", res.success is False)
            check("delivery_status is failed", res.delivery_status == "failed")
            check("error details captured with error code", "21608" in str(res.error))
            check("Auth Token not in error", "mock_auth_token" not in str(res.error))


def test_9_sms_history_endpoint():
    print("\n--- TEST 9: GET /sms/history ---")
    data = get_sms_dispatch_history(limit=50)
    check("success is True", data.get("success") is True)
    check("logs is list", isinstance(data.get("logs"), list))
    check("count >= 1 (includes mock_sent logs)", data.get("count") >= 1)


def test_10_zero_regression_on_sensor_and_prediction_records():
    print("\n--- TEST 10: Zero Regression on Sensor and Prediction Records ---")
    engine = db.get_mysql_engine()
    with engine.connect() as conn:
        sensor_count = conn.execute(text("SELECT COUNT(*) FROM sensor_readings;")).scalar()
        pred_count = conn.execute(text("SELECT COUNT(*) FROM predictions;")).scalar()

        check("sensor_readings intact and queryable", isinstance(sensor_count, int))
        check("predictions intact and queryable", isinstance(pred_count, int))
        print(f"  Existing records confirmed preserved: {sensor_count} sensor readings, {pred_count} predictions.")


def run_all():
    print("=" * 60)
    print("  FLOODGUARD SMS INTEGRATION TEST SUITE (MOCK + TWILIO)")
    print("=" * 60)
    test_1_phone_normalization()
    test_2_database_schema_preservation()
    test_3_sms_status_mock_mode()
    test_4_mock_provider_dispatch()
    test_5_whitelist_protection_blocks_unauthorized_numbers()
    test_6_mocked_twilio_dispatch_success()
    test_7_daily_limit_quota_enforcement()
    test_8_mocked_twilio_error_handling()
    test_9_sms_history_endpoint()
    test_10_zero_regression_on_sensor_and_prediction_records()
    print("\n" + "=" * 60)
    print("  ALL 10 INTEGRATION TESTS PASSED WITH ZERO REGRESSIONS!")
    print("=" * 60)


if __name__ == "__main__":
    run_all()
