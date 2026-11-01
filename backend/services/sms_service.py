"""
FloodGuard – SMS Management Service
===================================
Orchestrates safety policies, phone number validation, daily test quotas,
and dispatch logging for the FloodGuard SMS Alert System.

Strict Safety Rules:
1. ENABLE_COMMUNITY_BROADCAST is locked to False (no bulk dispatches).
2. Test SMS is restricted strictly to ADMIN_TEST_PHONE_NUMBER from .env.
3. Daily quota (MAX_DAILY_TEST_SMS) is strictly enforced via MySQL log count.
4. DEMO_MODE=True prepends [FLOODGUARD DEMO TEST] to all SMS bodies.
5. Secrets are read from .env; Auth Tokens are never logged or returned.
"""

import os
import re
import time
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

from backend.services.providers.base import BaseSMSProvider
from backend.services.providers.twilio_provider import TwilioSMSProvider
from backend.services.providers.mock_provider import MockSMSProvider
from backend.database_sms import (
    insert_sms_log,
    get_daily_test_sms_count,
    get_recent_sms_logs,
    get_recipient_stats,
)

# Anchor .env at project root
_HERE = Path(__file__).resolve().parent
_PROJECT_ROOT = _HERE.parent.parent
_ENV_PATH = _PROJECT_ROOT / ".env"

# Track timestamp of the last dispatched SMS in memory for cooldown
_last_dispatch_time: float = 0.0


def _load_env_config():
    """Loads environment variables from .env if present (respecting active environment overrides)."""
    if _ENV_PATH.exists():
        load_dotenv(dotenv_path=_ENV_PATH, override=False)


def normalize_phone_number(raw_phone: str) -> str:
    """
    Normalizes an input phone number to standardized E.164 format.
    Handles Indian mobile numbers:
      - '9876543210'        -> '+919876543210'
      - '09876543210'       -> '+919876543210'
      - '+91 98765-43210'   -> '+919876543210'
      - '+1 (555) 019-2834' -> '+15550192834'
    """
    if not raw_phone:
        return ""

    cleaned = re.sub(r"[\s\-\(\)\.]", "", str(raw_phone).strip())

    # 10-digit Indian number without country code
    if len(cleaned) == 10 and cleaned.isdigit():
        return f"+91{cleaned}"

    # 11-digit starting with leading 0 (domestic Indian trunk format)
    if len(cleaned) == 11 and cleaned.startswith("0") and cleaned[1:].isdigit():
        return f"+91{cleaned[1:]}"

    # 12-digit Indian number starting with 91 without plus
    if len(cleaned) == 12 and cleaned.startswith("91") and cleaned.isdigit():
        return f"+{cleaned}"

    # Ensure leading '+' for international format
    if not cleaned.startswith("+") and cleaned.isdigit():
        return f"+{cleaned}"

    return cleaned


def get_configured_provider() -> BaseSMSProvider:
    """
    Instantiates the configured SMS provider based on SMS_PROVIDER in .env.
    Defaults to MockSMSProvider (completely free, zero network calls, zero external API requests).
    """
    _load_env_config()
    provider_name = os.getenv("SMS_PROVIDER", "mock").strip().lower()
    if provider_name == "twilio":
        account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
        auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
        from_number = os.getenv("TWILIO_FROM_NUMBER", "")
        return TwilioSMSProvider(account_sid, auth_token, from_number)
    else:
        return MockSMSProvider()


def get_sms_status() -> dict:
    """
    Returns the comprehensive, truthful operational status of the SMS system.
    Never exposes full Auth Token or secrets.
    """
    _load_env_config()
    provider = get_configured_provider()
    is_mock = isinstance(provider, MockSMSProvider)
    provider_name = "mock" if is_mock else "twilio"
    is_ready = provider.is_configured()
    masked_creds = provider.get_masked_credentials()

    raw_admin_phone = os.getenv("ADMIN_TEST_PHONE_NUMBER", "").strip()
    norm_admin_phone = normalize_phone_number(raw_admin_phone) if raw_admin_phone else ""

    if norm_admin_phone and len(norm_admin_phone) >= 10:
        masked_test_phone = norm_admin_phone[:3] + " " + norm_admin_phone[3:5] + "*****" + norm_admin_phone[-2:]
    elif is_mock:
        masked_test_phone = "+91 98***** 0000 (Mock Simulated)"
    else:
        masked_test_phone = "Not Configured in .env"

    demo_mode = os.getenv("DEMO_MODE", "True").strip().lower() in ("true", "1", "yes")
    broadcast_enabled = os.getenv("ENABLE_COMMUNITY_BROADCAST", "False").strip().lower() in ("true", "1", "yes")
    daily_limit = int(os.getenv("MAX_DAILY_TEST_SMS", "5"))
    daily_count = get_daily_test_sms_count()
    recipient_stats = get_recipient_stats()

    return {
        "provider": provider_name,
        "is_mock": is_mock,
        "ready": is_ready,
        "demo_mode": demo_mode,
        "mode_notice": "MOCK MODE — NO REAL SMS SENT" if is_mock else "TWILIO GATEWAY ACTIVE",
        "community_broadcast_enabled": broadcast_enabled,
        "admin_test_phone_configured": bool(norm_admin_phone) or is_mock,
        "admin_test_phone_masked": masked_test_phone,
        "daily_test_count": daily_count,
        "daily_test_limit": daily_limit,
        "remaining_daily_tests": max(0, daily_limit - daily_count),
        "from_number": masked_creds["from_number"],
        "account_sid_masked": masked_creds["account_sid"],
        "recipients": recipient_stats,
    }


def send_test_sms(
    target_phone: str | None = None,
    custom_note: str | None = None,
    provider_override: BaseSMSProvider | None = None,
) -> dict:
    """
    Safely dispatches a single test SMS (via MockSMSProvider or TwilioSMSProvider).

    Guardrails Enforced:
      1. Recipient must match the configured ADMIN_TEST_PHONE_NUMBER (or default mock number).
      2. Daily limit (MAX_DAILY_TEST_SMS) must not be exceeded.
      3. Cooldown interval prevents accidental double-clicking.
      4. Community-wide broadcasts remain strictly disabled.
      5. Clearly labelled DEMO / MOCK status is enforced.
      6. Mock messages are recorded with delivery_status='mock_sent' (never real delivery).
    """
    global _last_dispatch_time
    _load_env_config()

    provider = provider_override or get_configured_provider()
    is_mock = isinstance(provider, MockSMSProvider)
    provider_name = "mock" if is_mock else "twilio"

    # ── Check 1: Verify Whitelist Configuration ──────────────────────────────
    raw_admin_phone = os.getenv("ADMIN_TEST_PHONE_NUMBER", "").strip()
    if not raw_admin_phone:
        if is_mock:
            raw_admin_phone = "+919876500000"  # Safe default simulated number for mock mode
        else:
            raise ValueError(
                "ADMIN_TEST_PHONE_NUMBER is not set in .env. "
                "Please configure your verified phone number in .env to enable test dispatches."
            )

    expected_phone = normalize_phone_number(raw_admin_phone)

    # Use target_phone if provided, otherwise default to configured number
    requested_phone = normalize_phone_number(target_phone) if target_phone else expected_phone

    if not is_mock and requested_phone != expected_phone:
        raise PermissionError(
            f"Unauthorized recipient number '{requested_phone}'. "
            "During testing, SMS dispatches are strictly restricted to your "
            f"configured verified phone number ({expected_phone[:3]} *****{expected_phone[-2:]})."
        )

    # ── Check 2: Daily Quota Enforcement ─────────────────────────────────────
    daily_limit = int(os.getenv("MAX_DAILY_TEST_SMS", "5"))
    daily_count = get_daily_test_sms_count()
    if daily_count >= daily_limit:
        raise RuntimeError(
            f"Daily test SMS quota reached ({daily_count}/{daily_limit}). "
            "Further test dispatches are paused to prevent runaway execution. "
            "Quota resets at midnight or can be adjusted in .env."
        )

    # ── Check 3: Cooldown Rate-Limit ─────────────────────────────────────────
    cooldown_secs = 5 if is_mock else int(os.getenv("SMS_COOLDOWN_SECONDS", "60"))
    elapsed = time.time() - _last_dispatch_time
    if elapsed < cooldown_secs and _last_dispatch_time > 0:
        remaining = int(cooldown_secs - elapsed)
        raise RuntimeError(
            f"SMS dispatch is cooling down. Please wait {remaining} seconds before sending another test message."
        )

    # ── Check 4: Provider Credential Validation ──────────────────────────────
    if not provider.is_configured():
        raise ValueError(
            "SMS provider credentials are not configured or invalid in .env."
        )

    # ── Build Safe Message Text ──────────────────────────────────────────────
    demo_mode = os.getenv("DEMO_MODE", "True").strip().lower() in ("true", "1", "yes")
    if is_mock:
        prefix = "[FLOODGUARD MOCK SIMULATION — NO REAL SMS SENT]"
    elif demo_mode:
        prefix = "[FLOODGUARD DEMO TEST]"
    else:
        prefix = "[FLOODGUARD ALERT]"

    now_str = datetime.now().strftime("%H:%M:%S")
    note_part = f" Note: {custom_note}." if custom_note else ""
    message_body = (
        f"{prefix} High flood alert simulation at Coimbatore station at {now_str}. "
        f"Water level: 3.2m, Rainfall: 45mm.{note_part} Academic project simulated test."
    )

    # ── Dispatch SMS via Active Provider ─────────────────────────────────────
    t0 = time.perf_counter()
    res = provider.send_sms(to_phone=expected_phone, message=message_body)
    duration_ms = (time.perf_counter() - t0) * 1000

    # ── Record Audit Log in MySQL ─────────────────────────────────────────────
    log_id = insert_sms_log(
        phone_number=expected_phone,
        message_text=message_body,
        provider_name=provider_name,
        delivery_status=res["status"],
        provider_message_id=res.get("provider_message_id"),
        error_details=res.get("error"),
        is_test=True,
    )

    if res["success"]:
        _last_dispatch_time = time.time()
        new_count = daily_count + 1
        success_msg = (
            "Simulated test SMS recorded in database (MOCK MODE — NO REAL SMS SENT)."
            if is_mock
            else "Test SMS dispatched successfully via Twilio."
        )
        return {
            "success": True,
            "log_id": log_id,
            "provider": provider_name,
            "provider_message_id": res.get("provider_message_id"),
            "delivery_status": res.get("status"),
            "recipient_masked": expected_phone[:3] + " " + expected_phone[3:5] + "*****" + expected_phone[-2:],
            "message": success_msg,
            "daily_tests_used": new_count,
            "daily_tests_remaining": max(0, daily_limit - new_count),
            "execution_ms": round(duration_ms, 2),
        }
    else:
        return {
            "success": False,
            "log_id": log_id,
            "provider": provider_name,
            "provider_message_id": None,
            "delivery_status": "failed",
            "error": res.get("error"),
            "recipient_masked": expected_phone[:3] + " " + expected_phone[3:5] + "*****" + expected_phone[-2:],
            "execution_ms": round(duration_ms, 2),
        }

