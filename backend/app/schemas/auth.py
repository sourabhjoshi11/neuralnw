import re
from datetime import datetime

from pydantic import BaseModel, validator


class SendOtpRequest(BaseModel):
    phone: str

    @validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = v.strip().replace(" ", "")
        if not re.match(r"^\+91\d{10}$", cleaned):
            raise ValueError("Must be a valid Indian number in format +91XXXXXXXXXX")
        return cleaned


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str

    @validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return v.strip().replace(" ", "")

    @validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v.strip()):
            raise ValueError("OTP must be exactly 6 digits")
        return v.strip()


class CompleteSignupRequest(BaseModel):
    name: str

    @validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if len(stripped) < 2 or len(stripped) > 100:
            raise ValueError("Name must be 2–100 characters")
        return stripped


class UserOut(BaseModel):
    id: str
    is_premium: bool
    is_banned: bool
    created_at: datetime | None = None

    
    class Config:
        orm_mode = True


class TokenResponse(BaseModel):
    token: str
    user: UserOut
    is_new_user: bool = False
