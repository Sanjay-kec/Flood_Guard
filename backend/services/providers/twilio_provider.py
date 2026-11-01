"""
Twilio SMS Provider
===================
Dispatches SMS via Twilio's official REST API using Python's standard requests library.
Supports trial accounts, sandbox routing, and standard E.164 phone numbers.

Safety Rules:
- Never hardcodes or logs full Auth Token.
- Catches network / HTTP exceptions cleanly without crashing FastAPI.
"""

import requests
from typing import Any
from backend.services.providers.base import BaseSMSProvider


class TwilioSMSProvider(BaseSMSProvider):
    """
    Direct Twilio REST API implementation.
    """

    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        self.account_sid = (account_sid or "").strip()
        self.auth_token = (auth_token or "").strip()
        self.from_number = (from_number or "").strip()
        self.api_url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"

    def is_configured(self) -> bool:
        """Returns True if all required Twilio credentials are present and non-empty."""
        return bool(
            self.account_sid.startswith("AC")
            and len(self.account_sid) >= 30
            and self.auth_token
            and self.from_number
        )

    def get_masked_credentials(self) -> dict[str, str]:
        """Returns masked credential identifiers for safe display/logging."""
        sid_masked = (
            self.account_sid[:6] + "..." + self.account_sid[-4:]
            if len(self.account_sid) >= 10
            else "Not Configured"
        )
        token_masked = (
            "********" + self.auth_token[-4:]
            if len(self.auth_token) >= 8
            else "Not Configured"
        )
        return {
            "account_sid": sid_masked,
            "auth_token": token_masked,
            "from_number": self.from_number or "Not Configured",
        }

    def send_sms(self, to_phone: str, message: str) -> dict[str, Any]:
        """
        Sends a single SMS message via Twilio's Messages endpoint.
        """
        if not self.is_configured():
            return {
                "success": False,
                "provider_name": "twilio",
                "provider_message_id": None,
                "status": "failed",
                "error": "Twilio credentials are not configured or invalid in .env (Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).",
            }

        payload = {
            "To": to_phone,
            "From": self.from_number,
            "Body": message,
        }

        try:
            response = requests.post(
                self.api_url,
                data=payload,
                auth=(self.account_sid, self.auth_token),
                timeout=12.0,
            )

            # Twilio returns HTTP 201 Created on success
            if response.status_code in (200, 201):
                res_data = response.json()
                sid = res_data.get("sid")
                status = res_data.get("status", "queued")
                return {
                    "success": True,
                    "provider_name": "twilio",
                    "provider_message_id": sid,
                    "status": status,
                    "error": None,
                }
            else:
                # Handle error responses from Twilio cleanly
                try:
                    err_json = response.json()
                    err_code = err_json.get("code", response.status_code)
                    err_msg = err_json.get("message", response.text)
                    more_info = err_json.get("more_info", "")
                    detail = f"Twilio Error [{err_code}]: {err_msg}"
                    if more_info:
                        detail += f" ({more_info})"
                except Exception:
                    detail = f"Twilio HTTP Error {response.status_code}: {response.text}"

                return {
                    "success": False,
                    "provider_name": "twilio",
                    "provider_message_id": None,
                    "status": "failed",
                    "error": detail,
                }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "provider_name": "twilio",
                "provider_message_id": None,
                "status": "failed",
                "error": "Twilio connection timed out after 12 seconds.",
            }
        except requests.exceptions.RequestException as req_exc:
            return {
                "success": False,
                "provider_name": "twilio",
                "provider_message_id": None,
                "status": "failed",
                "error": f"Twilio network request failed: {req_exc}",
            }
        except Exception as exc:
            return {
                "success": False,
                "provider_name": "twilio",
                "provider_message_id": None,
                "status": "failed",
                "error": f"Unexpected error during Twilio dispatch: {exc}",
            }

