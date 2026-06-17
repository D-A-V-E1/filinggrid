"""Tests for saved peer groups (dev in-memory + tier gates)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app
from middleware import AuthContext, check_professional_access
from peer_groups_service import (
    clear_dev_store,
    create_peer_group_for_org,
    delete_peer_group_for_org,
    list_peer_groups_for_org,
    DEV_PEER_ORG_ID,
)


@pytest.fixture(autouse=True)
def reset_dev_store():
    clear_dev_store()
    yield
    clear_dev_store()


@pytest.fixture
def client():
    return TestClient(app)


def test_peer_groups_require_professional():
    auth = AuthContext(tier="free")
    with pytest.raises(HTTPException) as exc:
        check_professional_access(auth)
    assert exc.value.status_code == 402


def test_dev_memory_crud_without_database():
    db = MagicMock()
    created = create_peer_group_for_org(db, DEV_PEER_ORG_ID, "Banks", ["jpm", "gs"])
    assert created["group_name"] == "Banks"
    assert created["tickers_list"] == ["JPM", "GS"]

    listed = list_peer_groups_for_org(db, DEV_PEER_ORG_ID)
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]

    delete_peer_group_for_org(db, DEV_PEER_ORG_ID, created["id"])
    assert list_peer_groups_for_org(db, DEV_PEER_ORG_ID) == []


def test_create_requires_two_tickers():
    db = MagicMock()
    with pytest.raises(HTTPException) as exc:
        create_peer_group_for_org(db, DEV_PEER_ORG_ID, "Solo", ["AAPL"])
    assert exc.value.status_code == 400


@patch("middleware.settings")
def test_anonymous_dev_pro_can_list_peer_groups(mock_settings, client):
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = False
    mock_settings.auth_configured = False

    res = client.get("/peer-groups", headers={"X-Dev-Tier": "professional"})
    assert res.status_code == 200
    assert res.json() == []


@patch("middleware.settings")
def test_anonymous_dev_pro_peer_group_crud(mock_settings, client):
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = False
    mock_settings.auth_configured = False

    headers = {"X-Dev-Tier": "professional"}

    create = client.post(
        "/peer-groups",
        headers=headers,
        json={"group_name": "Mega banks", "tickers_list": ["JPM", "GS", "MS"]},
    )
    assert create.status_code == 200, create.text
    body = create.json()
    assert body["group_name"] == "Mega banks"
    assert body["tickers_list"] == ["JPM", "GS", "MS"]

    listed = client.get("/peer-groups", headers=headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    deleted = client.delete(f"/peer-groups/{body['id']}", headers=headers)
    assert deleted.status_code == 200

    assert client.get("/peer-groups", headers=headers).json() == []


@patch("middleware.settings")
def test_anonymous_free_peer_groups_blocked(mock_settings, client):
    mock_settings.allow_dev_tier_toggle = True
    mock_settings.dev_pro_tier = False
    mock_settings.auth_configured = False

    res = client.get("/peer-groups", headers={"X-Dev-Tier": "free"})
    assert res.status_code == 401


@patch("middleware.settings")
def test_anonymous_without_dev_toggle_blocked(mock_settings, client):
    mock_settings.allow_dev_tier_toggle = False
    mock_settings.dev_pro_tier = False
    mock_settings.auth_configured = False

    res = client.get("/peer-groups", headers={"X-Dev-Tier": "professional"})
    assert res.status_code == 401
