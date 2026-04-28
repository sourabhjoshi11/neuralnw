import hashlib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, decrypt_field, encrypt_field
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
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _phone_hash(phone: str) -> str:
    return hashlib.sha256(phone.encode()).hexdigest()


@router.post("/send-otp")
async def send_otp_endpoint(body: SendOtpRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.phone_hash == _phone_hash(body.phone))
    )
    existing = result.scalar_one_or_none()
    if existing and existing.is_banned:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Phone number is banned")

    ok = await send_otp(body.phone)
    if not ok:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Failed to send OTP")
    return {"message": "OTP sent"}


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp_endpoint(body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    is_valid = await verify_otp(body.phone, body.otp)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP")

    phone_hash = _phone_hash(body.phone)
    result = await db.execute(select(User).where(User.phone_hash == phone_hash))
    user = result.scalar_one_or_none()

    if user:
        token = create_access_token(user.id)
        return TokenResponse(token=token, user=UserOut.model_validate(user), is_new_user=False)

    # Partial signup — create user without name, return temp token
    temp_token = create_access_token(f"pending:{body.phone}")
    return TokenResponse(
        token=temp_token,
        user=UserOut(id="pending", is_premium=False, is_banned=False),
        is_new_user=True,
    )


@router.post("/complete-signup", response_model=TokenResponse)
async def complete_signup(
    body: CompleteSignupRequest,
    db: AsyncSession = Depends(get_db),
    credentials=Depends(__import__("fastapi.security", fromlist=["HTTPBearer"]).HTTPBearer()),
):
    from app.core.security import decode_access_token
    from jose import JWTError

    try:
        payload = decode_access_token(credentials.credentials)
        sub: str = payload["sub"]
        if not sub.startswith("pending:"):
            raise ValueError
        phone = sub[len("pending:"):]
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signup token")

    phone_hash = _phone_hash(phone)
    result = await db.execute(select(User).where(User.phone_hash == phone_hash))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account already exists")

    user = User(
        phone_encrypted=encrypt_field(phone),
        phone_hash=phone_hash,
        name_encrypted=encrypt_field(body.name),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(token=token, user=UserOut.model_validate(user), is_new_user=False)
