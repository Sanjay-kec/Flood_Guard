"""
Base SMS Provider Interface
============================
Defines the abstract interface for all FloodGuard SMS gateway providers.
Enables pluggable providers (Twilio, Mock, Fast2SMS, MSG91) without altering alert logic.
"""

from abc import ABC, abstractmethod
from typing import Any


class BaseSMSProvider(ABC):
    """
    Abstract interface for FloodGuard SMS delivery adapters.
    """

    @abstractmethod
    def send_sms(self, to_phone: str, message: str) -> dict[str, Any]:
        """
        Sends an SMS message to a normalized E.164 phone number.

        Returns a standardized dictionary:
        {
            "success": bool,
            "provider_name": str,
            "provider_message_id": str | None,
            "status": "queued" | "sent" | "delivered" | "failed",
            "error": str | None
        }
        """
        pass

