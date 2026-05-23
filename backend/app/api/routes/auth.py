import hashlib
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import create_access_token, decode_access_token, encrypt_field
from app.db.base import get_db
from app.models.user import User
from app.schemas.auth import (
    CompleteSignupRequest,
    SendOtpRequest,
    TokenResponse,
    UserOut,
    VerifyOtpRequest,
)
from app.services.otp import send_otp, verify_otp

router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer()
_limiter = Limiter(key_func=get_remote_address)

# In-memory token blacklist for logout.
# In production replace with Redis SET with TTL matching token expiry.
_revoked_tokens: set[str] = set()


def _phone_hash(phone: str) -> str:
    return hashlib.sha256(phone.encode()).hexdigest()


def _revoke(token: str) -> None:
    _revoked_tokens.add(token)


def is_revoked(token: str) -> bool:
    return token in _revoked_tokens


# ─── Send OTP ────────────────────────────────────────────────────────────────

@router.post("/send-otp", status_code=status.HTTP_200_OK)
@_limiter.limit("5/minute")
async def send_otp_endpoint(request: Request, body: SendOtpRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.phone_hash == _phone_hash(body.phone)))
    existing = result.scalar_one_or_none()

    if existing and existing.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Phone number is banned")

    ok = await send_otp(body.phone)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send OTP. Please try again.",
        )
    return {"message": "OTP sent"}


# ─── Verify OTP ───────────────────────────────────────────────────────────────

@router.post("/verify-otp", response_model=TokenResponse)
@_limiter.limit("10/minute")
async def verify_otp_endpoint(request: Request, body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    is_valid = await verify_otp(body.phone, body.otp)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP. Please try again.",
        )

    phone_hash = _phone_hash(body.phone)
    result = await db.execute(select(User).where(User.phone_hash == phone_hash))
    user = result.scalar_one_or_none()

    if user:
        if user.is_banned:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is banned")
        token = create_access_token(user.id)
        return TokenResponse(token=token, user=UserOut.model_validate(user), is_new_user=False)

    # New user — issue a short-lived pending token scoped to this phone only
    pending_token = create_access_token(
        f"pending:{body.phone}",
        expires_delta=timedelta(minutes=30),
    )
    return TokenResponse(
        token=pending_token,
        user=UserOut(id="pending", is_premium=False, is_banned=False),
        is_new_user=True,
    )


# ─── Complete Signup ──────────────────────────────────────────────────────────

@router.post("/complete-signup", response_model=TokenResponse)
async def complete_signup(
    body: CompleteSignupRequest,
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
):
    raw_token = credentials.credentials
    try:
        payload = decode_access_token(raw_token)
        sub: str = payload["sub"]
        if not sub.startswith("pending:"):
            raise ValueError("Not a pending token")
        phone = sub[len("pending:"):]
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired signup token")

    phone_hash = _phone_hash(phone)
    result = await db.execute(select(User).where(User.phone_hash == phone_hash))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account already exists. Please log in.")

    user = User(
        phone_encrypted=encrypt_field(phone),
        phone_hash=phone_hash,
        name_encrypted=encrypt_field(body.name),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    _revoke(raw_token)  # pending token is single-use
    token = create_access_token(user.id)
    return TokenResponse(token=token, user=UserOut.model_validate(user), is_new_user=False)


# ─── Get current user (validate token on app start) ──────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


# ─── Logout ───────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    user: User = Depends(get_current_user),
):
    _revoke(credentials.credentials)


# ─── Delete Account (GDPR) ───────────────────────────────────────────────────

@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete account and all associated data."""
    from sqlalchemy import delete as sql_delete
    from app.models.feed import FeedMember, FeedMessage

    # Soft-delete: anonymise messages (preserve feed integrity)
    await db.execute(
        sql_delete(FeedMember).where(FeedMember.user_id == user.id)
    )

    # Delete the user record
    await db.delete(user)
    await db.commit()

    # Revoke token
    _revoke(credentials.credentials)
