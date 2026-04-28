from pydantic import BaseModel, field_validator
import re


class SendOtpRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        cleaned = re.sub(r"\D", "", v)
        if not re.match(r"^\+?91\d{10}$", v.replace(" ", "")):
            raise ValueError("Invalid Indian phone number")
        return v.strip()


class VerifyOtpRequest(BaseModel):
    phone: str
    otp: str

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        if not re.match(r"^\d{6}$", v):
            raise ValueError("OTP must be 6 digits")
        return v


class CompleteSignupRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        stripped = v.strip()
        if len(stripped) < 2 or len(stripped) > 100:
            raise ValueError("Name must be 2-100 characters")
        return stripped


class UserOut(BaseModel):
    id: str
    is_premium: bool
    is_banned: bool

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    token: str
    user: UserOut
    is_new_user: bool = False
