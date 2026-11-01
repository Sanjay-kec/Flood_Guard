"""
FloodGuard – SMS API Routes
============================
Provides FastAPI routes for:
  1. GET  /sms/status     – Operational status, provider info, daily quota, whitelist state
  2. GET  /sms/history    – Historical audit log of all SMS dispatches from MySQL
  3. POST /sms/test-send  – Protected single-recipient test SMS endpoint
"""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from backend.services.sms_service import (
    get_sms_status,
    send_test_sms,
    get_recent_sms_logs,
)

router = APIRouter(tags=["SMS Alert Gateway"])


class TestSmsRequest(BaseModel):
    phone_number: str | None = Field(
        None,
        description="Target phone number (must match ADMIN_TEST_PHONE_NUMBER from .env). If omitted, defaults to configured number.",
        example="+919876543210",
    )
    note: str | None = Field(
        None,
        description="Optional brief label or note to append to the demo message.",
        example="Manual test from React dashboard",
    )


class TestSmsResponse(BaseModel):
    success: bool
    log_id: int | None = None
    provider: str
    provider_message_id: str | None = None
    delivery_status: str
    recipient_masked: str
    message: str | None = None
    error: str | None = None
    daily_tests_used: int | None = None
    daily_tests_remaining: int | None = None
    execution_ms: float | None = None


@router.get(
    "/sms/status",
    summary="Get SMS gateway status and daily limits",
    response_description="Current provider status, daily quota, and whitelist information",
)
def get_gateway_status():
    """
    Returns current SMS gateway status without leaking sensitive credentials.
    """
    try:
        return get_sms_status()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve SMS status: {exc}",
        )


@router.get(
    "/sms/history",
    summary="Get recent SMS dispatch logs",
    response_description="List of recent SMS dispatches with masked phone numbers",
)
def get_sms_dispatch_history(limit: int = 50):
    """
    Retrieves recent SMS dispatch records stored in the MySQL database.
    """
    try:
        logs = get_recent_sms_logs(limit=limit)
        return {
            "success": True,
            "count": len(logs),
            "logs": logs,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve SMS history: {exc}",
        )


@router.post(
    "/sms/test-send",
    response_model=TestSmsResponse,
    summary="Send a protected test SMS to verified mobile",
    response_description="Twilio dispatch status and message SID",
)
def post_test_sms(payload: TestSmsRequest | None = None):
    """
    Dispatches a single test SMS to your configured, verified phone number.

    Security & Safety Policies Enforced:
      - Strictly restricted to ADMIN_TEST_PHONE_NUMBER from .env.
      - Daily quota (MAX_DAILY_TEST_SMS) stops runaway credit consumption.
      - Cooldown timer prevents duplicate button clicks.
      - Community broadcast is locked (disabled).
      - Demo watermark is included in all messages.
    """
    phone = payload.phone_number if payload else None
    note = payload.note if payload else None

    try:
        result = send_test_sms(target_phone=phone, custom_note=note)
        if not result["success"]:
            # Provider returned an error (e.g., Twilio account error)
            return TestSmsResponse(
                success=False,
                log_id=result.get("log_id"),
                provider="twilio",
                provider_message_id=None,
                delivery_status="failed",
                recipient_masked=result.get("recipient_masked", ""),
                error=result.get("error"),
                execution_ms=result.get("execution_ms"),
            )
        return TestSmsResponse(**result)

    except PermissionError as perm_err:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(perm_err),
        )
    except RuntimeError as limit_err:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(limit_err),
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected server error during test SMS dispatch: {exc}",
        )
