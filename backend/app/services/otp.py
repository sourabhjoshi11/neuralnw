# import httpx
# from app.core.config import settings

# TODO: Uncomment and configure once MSG91 DLT registration is approved.
# _MSG91_BASE = "https://control.msg91.com/api/v5/otp"


async def send_otp(phone: str) -> bool:
    """MOCKED — always returns True until MSG91 DLT is approved."""
    return True


async def verify_otp(phone: str, code: str) -> bool:
    """MOCKED — accepts '123456' as the valid OTP for any phone number."""
    return code == "123456"

# ── MSG91 implementation (enable after DLT approval) ──────────────────────────
#
# async def send_otp(phone: str) -> bool:
#     """Send OTP via MSG91. Phone must be digits only e.g. 919876543210."""
#     try:
#         async with httpx.AsyncClient(timeout=10) as client:
#             resp = await client.post(
#                 _MSG91_BASE,
#                 headers={"authkey": settings.MSG91_AUTH_KEY, "accept": "application/json"},
#                 json={
#                     "template_id": settings.MSG91_TEMPLATE_ID,
#                     "mobile": phone,
#                     "otp_length": 6,
#                     "otp_expiry": 10,
#                 },
#             )
#             return resp.json().get("type") == "success"
#     except Exception:
#         return False
#
# async def verify_otp(phone: str, code: str) -> bool:
#     """Verify OTP via MSG91."""
#     try:
#         async with httpx.AsyncClient(timeout=10) as client:
#             resp = await client.post(
#                 f"{_MSG91_BASE}/verify",
#                 headers={"authkey": settings.MSG91_AUTH_KEY, "accept": "application/json"},
#                 json={"mobile": phone, "otp": code},
#             )
#             return resp.json().get("type") == "success"
#     except Exception:
#         return False
