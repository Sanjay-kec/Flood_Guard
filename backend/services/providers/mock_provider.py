"""
Mock SMS Provider
=================
Simulates SMS delivery locally for development, demonstration, and academic evaluation.
Zero external API calls. Zero network dependencies. Completely free.
Never calls Twilio or any external/paid SMS gateway.
"""

import time
import uuid
from typing import Any
from backend.services.providers.base import BaseSMSProvider


class MockSMSProvider(BaseSMSProvider):
    """
    In-memory / simulated SMS provider.
    Generates realistic mock delivery confirmations without external network requests.
    """

    def __init__(self, simulated_from_number: str = "+1 (555) 000-MOCK"):
        self.simulated_from_number = simulated_from_number

    def is_configured(self) -> bool:
        """Mock provider is always ready and configured out-of-the-box."""
        return True

    def get_masked_credentials(self) -> dict[str, str]:
        """Returns safe, simulated identifiers."""
        return {
            "account_sid": "MOCK-LOCAL-SIMULATOR",
            "auth_token": "NOT-APPLICABLE (MOCK MODE)",
            "from_number": self.simulated_from_number,
        }

    def send_sms(self, to_phone: str, message: str) -> dict[str, Any]:
        """
        Simulates sending an SMS message.
        Does NOT make any HTTP/network request.
        Logs message to stdout for developer inspection and returns mock_sent status.
        """
        timestamp_ms = int(time.time() * 1000)
        mock_sid = f"MOCK-SMS-{timestamp_ms}-{uuid.uuid4().hex[:6]}"

        masked_dest = (
            to_phone[:3] + " " + to_phone[3:5] + "*****" + to_phone[-2:]
            if len(to_phone) >= 10
            else to_phone
        )

        print(f"\n[MockSMSProvider] ----------------------------------------")
        print(f"[MockSMSProvider] SIMULATED SMS DISPATCH (MOCK MODE)")
        print(f"[MockSMSProvider] Recipient: {masked_dest}")
        print(f"[MockSMSProvider] From:      {self.simulated_from_number}")
        print(f"[MockSMSProvider] Mock SID:  {mock_sid}")
        print(f"[MockSMSProvider] Message:   {message}")
        print(f"[MockSMSProvider] Status:    mock_sent (Simulated locally)")
        print(f"[MockSMSProvider] ----------------------------------------\n")

        return {
            "success": True,
            "provider_name": "mock",
            "provider_message_id": mock_sid,
            "status": "mock_sent",
            "error": None,
        }

