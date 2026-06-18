"""Signed-in auth + saved peer group integration (real JWT + PostgreSQL)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from database import Organization, SavedPeerGroup, User
from tests.auth_helpers import bearer_headers, mint_test_jwt, unique_test_email

pytestmark = pytest.mark.integration


def _cleanup_test_user(db, email: str) -> None:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return
    org_id = user.organization_id
    if org_id:
        db.query(SavedPeerGroup).filter(SavedPeerGroup.organization_id == org_id).delete()
    db.delete(user)
    if org_id:
        org = db.query(Organization).filter(Organization.id == org_id).first()
        if org:
            db.delete(org)
    db.commit()


def _set_org_tier(db, email: str, tier: str) -> str:
    user = db.query(User).filter(User.email == email).first()
    assert user is not None and user.organization is not None
    user.organization.subscription_tier = tier
    db.commit()
    return user.organization.id


@pytest.fixture
def auth_client(integration_auth_env):
    from main import app

    return TestClient(app)


def test_unsigned_peer_groups_require_auth(auth_client):
    res = auth_client.get("/peer-groups")
    assert res.status_code == 401


def test_auth_me_provisions_user_on_first_request(auth_client, integration_auth_env, db_session):
    email = unique_test_email("provision")
    token = mint_test_jwt(email, integration_auth_env["secret"])
    headers = bearer_headers(token)

    try:
        res = auth_client.get("/auth/me", headers=headers)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["is_authenticated"] is True
        assert body["email"] == email
        assert body["tier"] == "free"
        assert body["organization_id"]

        user = db_session.query(User).filter(User.email == email).first()
        assert user is not None
        assert user.organization_id == body["organization_id"]
    finally:
        _cleanup_test_user(db_session, email)


def test_signed_in_free_user_peer_groups_paywalled(auth_client, integration_auth_env, db_session):
    email = unique_test_email("free")
    token = mint_test_jwt(email, integration_auth_env["secret"])
    headers = bearer_headers(token)

    try:
        auth_client.get("/auth/me", headers=headers)

        res = auth_client.get("/peer-groups", headers=headers)
        assert res.status_code == 402
        detail = res.json()["detail"]
        assert detail["code"] == "PAYWALL"
    finally:
        _cleanup_test_user(db_session, email)


def test_signed_in_pro_peer_group_crud_persists(auth_client, integration_auth_env, db_session):
    email = unique_test_email("pro")
    token = mint_test_jwt(email, integration_auth_env["secret"])
    headers = bearer_headers(token)

    try:
        me = auth_client.get("/auth/me", headers=headers)
        assert me.status_code == 200
        org_id = _set_org_tier(db_session, email, "professional")

        listed = auth_client.get("/peer-groups", headers=headers)
        assert listed.status_code == 200
        assert listed.json() == []

        created = auth_client.post(
            "/peer-groups",
            headers=headers,
            json={"group_name": "Integration banks", "tickers_list": ["JPM", "GS", "MS"]},
        )
        assert created.status_code == 200, created.text
        group = created.json()
        assert group["group_name"] == "Integration banks"
        assert group["tickers_list"] == ["JPM", "GS", "MS"]

        listed2 = auth_client.get("/peer-groups", headers=headers)
        assert listed2.status_code == 200
        ids = [g["id"] for g in listed2.json()]
        assert group["id"] in ids

        rows = (
            db_session.query(SavedPeerGroup)
            .filter(SavedPeerGroup.organization_id == org_id)
            .all()
        )
        assert len(rows) == 1
        assert rows[0].group_name == "Integration banks"

        deleted = auth_client.delete(f"/peer-groups/{group['id']}", headers=headers)
        assert deleted.status_code == 200

        assert auth_client.get("/peer-groups", headers=headers).json() == []
        assert (
            db_session.query(SavedPeerGroup)
            .filter(SavedPeerGroup.organization_id == org_id)
            .count()
            == 0
        )
    finally:
        _cleanup_test_user(db_session, email)
