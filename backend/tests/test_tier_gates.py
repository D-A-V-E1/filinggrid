"""Tests for subscription tier gates and dev tier overrides."""

from datetime import datetime
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from middleware import (
    AuthContext,
    TIER_LIMITS,
    check_parse_access,
    check_professional_access,
    get_auth_context,
    resolve_effective_tier,
)


def test_free_column_limit_blocks_fourth_ticker():
    auth = AuthContext(tier="free")
    with pytest.raises(HTTPException) as exc:
        check_parse_access(auth, 4)
    assert exc.value.status_code == 402
    assert exc.value.detail["reason"] == "column_limit"
    assert exc.value.detail["max_columns"] == 3


def test_free_allows_three_columns():
    auth = AuthContext(tier="free")
    check_parse_access(auth, 3)


def test_pro_allows_eight_columns():
    auth = AuthContext(tier="professional")
    check_parse_access(auth, 8)


def test_pro_blocks_ninth_column():
    auth = AuthContext(tier="professional")
    with pytest.raises(HTTPException) as exc:
        check_parse_access(auth, 9)
    assert exc.value.status_code == 402
    assert exc.value.detail["reason"] == "column_limit"
    assert "Professional supports up to 8" in exc.value.detail["message"]


def test_free_blocks_historical_year():
    auth = AuthContext(tier="free")
    prior_year = datetime.now().year - 1
    with pytest.raises(HTTPException) as exc:
        check_parse_access(auth, 1, prior_year)
    assert exc.value.status_code == 402
    assert exc.value.detail["reason"] == "historical_data"


def test_pro_allows_historical_year():
    auth = AuthContext(tier="professional")
    prior_year = datetime.now().year - 1
    check_parse_access(auth, 1, prior_year)


def test_peer_groups_require_professional():
    auth = AuthContext(tier="free")
    with pytest.raises(HTTPException) as exc:
        check_professional_access(auth)
    assert exc.value.status_code == 402
    assert exc.value.detail["reason"] == "subscription_required"


def test_tier_limits_matrix():
    assert TIER_LIMITS["free"]["max_columns"] == 3
    assert TIER_LIMITS["free"]["historical"] is False
    assert TIER_LIMITS["professional"]["max_columns"] == 8
    assert TIER_LIMITS["professional"]["historical"] is True


def test_resolve_effective_tier_without_dev_toggle(monkeypatch):
    mock_settings = MagicMock()
    mock_settings.allow_dev_tier_toggle = False
    mock_settings.dev_pro_tier = False
    monkeypatch.setattr("middleware.settings", mock_settings)

    request = MagicMock()
    request.headers.get.return_value = "professional"
    assert resolve_effective_tier(request, "free") == "free"


def test_resolve_effective_tier_header_override(monkeypatch):
    mock_settings = MagicMock()
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = False
    monkeypatch.setattr("middleware.settings", mock_settings)

    request = MagicMock()
    request.headers.get.return_value = "professional"
    assert resolve_effective_tier(request, "free") == "professional"


def test_resolve_effective_tier_env_override(monkeypatch):
    mock_settings = MagicMock()
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = True
    monkeypatch.setattr("middleware.settings", mock_settings)

    request = MagicMock()
    request.headers.get.return_value = None
    assert resolve_effective_tier(request, "free") == "professional"


def test_resolve_effective_tier_header_beats_env(monkeypatch):
    mock_settings = MagicMock()
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = True
    monkeypatch.setattr("middleware.settings", mock_settings)

    request = MagicMock()
    request.headers.get.return_value = "free"
    assert resolve_effective_tier(request, "professional") == "free"


def test_dev_tier_endpoint_hidden_without_toggle(monkeypatch):
    from dev_routes import _ensure_dev_toggle_allowed

    mock_settings = MagicMock()
    mock_settings.allow_dev_tier_toggle = False
    monkeypatch.setattr("dev_routes.settings", mock_settings)

    with pytest.raises(HTTPException) as exc:
        _ensure_dev_toggle_allowed()
    assert exc.value.status_code == 404


@pytest.mark.anyio
async def test_get_auth_context_applies_dev_header_for_anonymous(monkeypatch):
    mock_settings = MagicMock()
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = False
    mock_settings.auth_configured = False
    monkeypatch.setattr("middleware.settings", mock_settings)

    request = MagicMock()
    request.headers.get.return_value = "professional"

    auth = await get_auth_context(request, credentials=None, db=MagicMock())
    assert auth.is_authenticated is False
    assert auth.tier == "professional"
    assert auth.limits["max_columns"] == 8


@pytest.mark.anyio
async def test_get_auth_context_applies_env_override_without_auth(monkeypatch):
    mock_settings = MagicMock()
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = True
    mock_settings.auth_configured = False
    monkeypatch.setattr("middleware.settings", mock_settings)

    request = MagicMock()
    request.headers.get.return_value = None

    auth = await get_auth_context(request, credentials=None, db=MagicMock())
    assert auth.is_authenticated is False
    assert auth.tier == "professional"
    assert auth.limits["max_columns"] == 8
