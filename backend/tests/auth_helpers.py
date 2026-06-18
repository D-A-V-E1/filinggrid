"""Helpers for signed-in API integration tests (HS256 test JWTs)."""

from __future__ import annotations

import time
import uuid

import jwt

TEST_JWT_SECRET = "filinggrid-integration-test-jwt-secret"


def unique_test_email(label: str) -> str:
    return f"integration-{label}-{uuid.uuid4().hex[:12]}@filinggrid.test"


def mint_test_jwt(email: str, secret: str = TEST_JWT_SECRET, sub: str | None = None) -> str:
    """Mint a Supabase-compatible HS256 access token for integration tests."""
    now = int(time.time())
    payload = {
        "sub": sub or str(uuid.uuid4()),
        "email": email,
        "aud": "authenticated",
        "exp": now + 3600,
        "iat": now,
        "role": "authenticated",
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def bearer_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
