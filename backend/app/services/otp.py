from twilio.rest import Client

from app.core.config import settings

_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client


async def send_otp(phone: str) -> bool:
    try:
        client = _get_client()
        client.verify.v2.services(settings.TWILIO_VERIFY_SID).verifications.create(
            to=phone, channel="sms"
        )
        return True
    except Exception:
        return False


async def verify_otp(phone: str, code: str) -> bool:
    try:
        client = _get_client()
        result = client.verify.v2.services(settings.TWILIO_VERIFY_SID).verification_checks.create(
            to=phone, code=code
        )
        return result.status == "approved"
    except Exception:
        return False
