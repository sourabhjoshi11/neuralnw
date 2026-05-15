"""
Integration test for the complete auth flow using TestClient + SQLite.
Run: python -m scripts.test_auth_flow
"""
import asyncio
import os
import sys
import uuid
from unittest.mock import AsyncMock, patch

# Set required env vars before importing app
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-auth-tests")
os.environ.setdefault(
    "ENCRYPTION_KEY",
    "kVbUp0_zuPcE5j8u-l55vv9GCzCa5ZAMGgBNcNdpsac="  # valid 32-byte Fernet key for tests
)
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

from fastapi.testclient import TestClient

import app.services.otp as _otp_module  # ensure module is loaded before patching

# Patch Twilio OTP so we don't need real credentials
with patch.object(_otp_module, "send_otp", new=AsyncMock(return_value=True)), \
     patch.object(_otp_module, "verify_otp", new=AsyncMock(return_value=True)):

    from main import app
    from app.db.base import engine, Base

    async def create_tables():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(create_tables())

    client = TestClient(app, raise_server_exceptions=True)


TEST_PHONE = "+919876543210"


def test_send_otp():
    with patch("app.services.otp.send_otp", new=AsyncMock(return_value=True)):
        r = client.post("/auth/send-otp", json={"phone": TEST_PHONE})
    assert r.status_code == 200, r.text
    assert r.json()["message"] == "OTP sent"
    print("  ✅  send-otp: 200 OK")


def test_send_otp_invalid_phone():
    with patch("app.services.otp.send_otp", new=AsyncMock(return_value=True)):
        r = client.post("/auth/send-otp", json={"phone": "12345"})
    assert r.status_code == 422
    print("  ✅  send-otp: rejects invalid phone")


def test_verify_otp_new_user():
    with patch("app.services.otp.verify_otp", new=AsyncMock(return_value=True)):
        r = client.post("/auth/verify-otp", json={"phone": TEST_PHONE, "otp": "123456"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["is_new_user"] is True
    assert data["token"]
    assert data["user"]["id"] == "pending"
    print("  ✅  verify-otp: new user → pending token + is_new_user=True")
    return data["token"]


def test_complete_signup(pending_token: str):
    r = client.post(
        "/auth/complete-signup",
        json={"name": "Rahul Sharma"},
        headers={"Authorization": f"Bearer {pending_token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["token"]
    assert data["user"]["id"] != "pending"
    assert data["is_new_user"] is False
    print("  ✅  complete-signup: user created, real token returned")
    return data["token"]


def test_complete_signup_duplicate(pending_token: str):
    # Should fail — account already created for this phone
    new_pending = None
    with patch("app.services.otp.verify_otp", new=AsyncMock(return_value=True)):
        r = client.post("/auth/verify-otp", json={"phone": TEST_PHONE, "otp": "123456"})
    # Second time the user exists → should NOT be is_new_user
    data = r.json()
    assert data["is_new_user"] is False, "Existing user should not be flagged as new"
    print("  ✅  verify-otp: existing user → is_new_user=False")


def test_get_me(token: str):
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["id"] not in ("", "pending")
    assert data["is_banned"] is False
    print("  ✅  GET /auth/me: returns valid user")


def test_get_me_unauthenticated():
    r = client.get("/auth/me", headers={"Authorization": "Bearer bad-token"})
    assert r.status_code == 401
    print("  ✅  GET /auth/me: 401 with invalid token")


def test_logout(token: str):
    r = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 204
    print("  ✅  POST /auth/logout: 204 No Content")


def test_me_after_logout(token: str):
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401, f"Expected 401 after logout, got {r.status_code}"
    print("  ✅  GET /auth/me after logout: 401 (token revoked)")


def test_complete_signup_with_revoked_pending_token(pending_token: str):
    # Pending token was consumed during complete-signup — should now fail
    r = client.post(
        "/auth/complete-signup",
        json={"name": "Another Name"},
        headers={"Authorization": f"Bearer {pending_token}"},
    )
    assert r.status_code in (401, 409), f"Expected 401 or 409, got {r.status_code}"
    print("  ✅  complete-signup: revoked/used pending token rejected")


if __name__ == "__main__":
    print("\nRunning auth flow tests...\n")
    try:
        test_send_otp()
        test_send_otp_invalid_phone()
        pending_token = test_verify_otp_new_user()
        full_token = test_complete_signup(pending_token)
        test_complete_signup_duplicate(pending_token)
        test_complete_signup_with_revoked_pending_token(pending_token)
        test_get_me(full_token)
        test_get_me_unauthenticated()
        test_logout(full_token)
        test_me_after_logout(full_token)
        print("\n✅  All auth tests passed!\n")
    except AssertionError as e:
        print(f"\n❌  Test failed: {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌  Unexpected error: {e}\n")
        raise
