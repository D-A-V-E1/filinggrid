"""Shared pytest fixtures for database-backed integration tests."""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text

from config import Settings
from tests.auth_helpers import TEST_JWT_SECRET


def _database_available() -> bool:
    try:
        from database import engine

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def ensure_db_schema():
    if not _database_available():
        pytest.skip("PostgreSQL is not available for integration tests")
    from database import init_db

    init_db()


@pytest.fixture
def integration_auth_env(monkeypatch, ensure_db_schema):
    """Configure HS256 JWT auth without dev-tier overrides."""
    import middleware
    import peer_groups_service

    test_settings = Settings(
        _env_file=None,
        database_url=os.environ.get(
            "DATABASE_URL",
            "postgresql://filinggrid:filinggrid@localhost:5432/filinggrid",
        ),
        supabase_jwt_secret=TEST_JWT_SECRET,
        supabase_url="",
        allow_dev_tier_toggle=False,
        dev_pro_tier=False,
    )
    monkeypatch.setattr(middleware, "settings", test_settings)
    monkeypatch.setattr(peer_groups_service, "settings", test_settings)
    return {"secret": TEST_JWT_SECRET, "settings": test_settings}


@pytest.fixture
def db_session(ensure_db_schema):
    from database import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
async def _reset_sec_client_between_tests():
    """Avoid httpx / asyncio lock bleed across anyio test loops (Windows)."""
    from sec import client as sec_client

    async def _reset() -> None:
        try:
            await sec_client.close_http_client()
        except Exception:
            pass
        sec_client._ticker_map_inflight = None
        sec_client._submissions_inflight.clear()
        sec_client._filing_html_inflight.clear()

    await _reset()
    yield
    await _reset()
