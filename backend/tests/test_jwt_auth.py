"""Tests for Supabase JWT verification (JWKS ES256 + legacy HS256 fallback)."""

from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi import HTTPException

from config import Settings
from middleware import decode_jwt


def test_settings_derives_jwks_url_from_next_public_env_alias(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    for key in ("SUPABASE_URL", "supabase_url"):
        monkeypatch.delenv(key, raising=False)
    settings = Settings(_env_file=None)
    assert settings.supabase_jwks_url_resolved == (
        "https://example.supabase.co/auth/v1/.well-known/jwks.json"
    )
    assert settings.auth_configured is True


def test_settings_derives_jwks_url_from_supabase_url():
    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_jwt_secret="",
    )
    assert settings.supabase_jwks_url_resolved == (
        "https://example.supabase.co/auth/v1/.well-known/jwks.json"
    )
    assert settings.auth_configured is True


def test_settings_jwks_url_override():
    settings = Settings(
        supabase_url="https://example.supabase.co",
        supabase_jwks_url="https://custom.example/jwks.json",
    )
    assert settings.supabase_jwks_url_resolved == "https://custom.example/jwks.json"


def test_settings_todo_values_not_configured():
    settings = Settings(
        supabase_url="TODO_https://YOUR_PROJECT.supabase.co",
        supabase_jwt_secret="TODO_your-jwt-secret",
    )
    assert settings.supabase_jwks_url_resolved == ""
    assert settings.supabase_jwt_secret_effective == ""
    assert settings.auth_configured is False


def test_decode_jwt_not_configured(monkeypatch):
    mock_settings = MagicMock()
    mock_settings.auth_configured = False
    monkeypatch.setattr("middleware.settings", mock_settings)

    with pytest.raises(HTTPException) as exc:
        decode_jwt("token")
    assert exc.value.status_code == 401
    assert exc.value.detail["code"] == "AUTH_NOT_CONFIGURED"


@patch("middleware._decode_jwt_jwks")
def test_decode_jwt_uses_jwks_when_configured(mock_jwks, monkeypatch):
    mock_settings = MagicMock()
    mock_settings.auth_configured = True
    mock_settings.supabase_jwks_url_resolved = "https://example.supabase.co/auth/v1/.well-known/jwks.json"
    mock_settings.supabase_jwt_secret_effective = ""
    mock_jwks.return_value = {"email": "user@corp.com", "sub": "user-id"}
    monkeypatch.setattr("middleware.settings", mock_settings)

    payload = decode_jwt("es256-token")
    assert payload["email"] == "user@corp.com"
    mock_jwks.assert_called_once_with("es256-token")


@patch("middleware._decode_jwt_hs256")
@patch("middleware._decode_jwt_jwks")
def test_decode_jwt_falls_back_to_hs256(mock_jwks, mock_hs256, monkeypatch):
    mock_settings = MagicMock()
    mock_settings.auth_configured = True
    mock_settings.supabase_jwks_url_resolved = "https://example.supabase.co/auth/v1/.well-known/jwks.json"
    mock_settings.supabase_jwt_secret_effective = "legacy-secret"
    mock_jwks.side_effect = jwt.InvalidTokenError("wrong alg")
    mock_hs256.return_value = {"email": "legacy@corp.com"}
    monkeypatch.setattr("middleware.settings", mock_settings)

    payload = decode_jwt("hs256-token")
    assert payload["email"] == "legacy@corp.com"
    mock_jwks.assert_called_once()
    mock_hs256.assert_called_once_with("hs256-token")


@patch("middleware._decode_jwt_jwks")
def test_decode_jwt_expired_token(mock_jwks, monkeypatch):
    mock_settings = MagicMock()
    mock_settings.auth_configured = True
    mock_settings.supabase_jwks_url_resolved = "https://example.supabase.co/auth/v1/.well-known/jwks.json"
    mock_settings.supabase_jwt_secret_effective = ""
    mock_jwks.side_effect = jwt.ExpiredSignatureError("expired")
    monkeypatch.setattr("middleware.settings", mock_settings)

    with pytest.raises(HTTPException) as exc:
        decode_jwt("expired-token")
    assert exc.value.detail["code"] == "TOKEN_EXPIRED"
