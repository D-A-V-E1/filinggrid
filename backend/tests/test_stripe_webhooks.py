"""Tests for Stripe webhook tier updates and idempotency (no live Stripe API)."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from billing.stripe_routes import _upsert_subscription
from database import Organization, Subscription


def _make_org(tier: str = "free") -> Organization:
    org = Organization(name="Test Org", subscription_tier=tier)
    org.id = "org-123"
    return org


def test_upsert_subscription_sets_professional_for_active():
    org = _make_org("free")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    stripe_sub = {
        "id": "sub_123",
        "status": "active",
        "current_period_end": int(datetime(2026, 7, 1, tzinfo=timezone.utc).timestamp()),
        "cancel_at_period_end": False,
        "items": {"data": [{"price": {"id": "price_test"}}]},
    }

    _upsert_subscription(db, org, stripe_sub)

    assert org.subscription_tier == "professional"
    db.add.assert_called_once()
    db.commit.assert_called_once()


def test_upsert_subscription_sets_free_for_canceled_status():
    org = _make_org("professional")
    existing_sub = Subscription(organization_id=org.id, status="active")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing_sub

    stripe_sub = {
        "id": "sub_123",
        "status": "canceled",
        "current_period_end": None,
        "cancel_at_period_end": False,
        "items": {"data": [{"price": {"id": "price_test"}}]},
    }

    _upsert_subscription(db, org, stripe_sub)

    assert org.subscription_tier == "free"
    assert existing_sub.status == "canceled"


@pytest.mark.anyio
async def test_webhook_rejects_missing_signature():
    from billing.stripe_routes import stripe_webhook

    request = MagicMock()
    request.body = AsyncMock(return_value=b"{}")
    request.headers.get.return_value = None
    db = MagicMock()

    with patch("billing.stripe_routes.settings") as mock_settings:
        mock_settings.stripe_secret_key = "sk_test"
        mock_settings.stripe_price_professional = "price_test"
        mock_settings.stripe_webhook_secret = "whsec_test"

        with patch("billing.stripe_routes.stripe.Webhook.construct_event") as construct:
            construct.side_effect = ValueError("bad payload")
            with pytest.raises(HTTPException) as exc:
                await stripe_webhook(request, db)
            assert exc.value.status_code == 400


@pytest.mark.anyio
async def test_webhook_idempotent_on_duplicate_event():
    from billing.stripe_routes import stripe_webhook

    request = MagicMock()
    request.body = AsyncMock(return_value=b"{}")
    request.headers.get.return_value = "sig"

    existing_event = MagicMock()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing_event

    event = {"id": "evt_dup", "type": "customer.subscription.updated", "data": {"object": {}}}

    with patch("billing.stripe_routes.settings") as mock_settings:
        mock_settings.stripe_secret_key = "sk_test"
        mock_settings.stripe_price_professional = "price_test"
        mock_settings.stripe_webhook_secret = "whsec_test"

        with patch("billing.stripe_routes.stripe.Webhook.construct_event", return_value=event):
            result = await stripe_webhook(request, db)
            assert result == {"status": "already_processed"}


@pytest.mark.anyio
async def test_webhook_returns_503_when_billing_not_configured():
    from billing.stripe_routes import stripe_webhook

    request = MagicMock()
    db = MagicMock()

    with patch("billing.stripe_routes.settings") as mock_settings:
        mock_settings.stripe_secret_key = ""
        mock_settings.stripe_price_professional = ""

        with pytest.raises(HTTPException) as exc:
            await stripe_webhook(request, db)
        assert exc.value.status_code == 503


@pytest.mark.anyio
async def test_webhook_handles_integrity_error_on_concurrent_insert():
    from billing.stripe_routes import stripe_webhook

    request = MagicMock()
    request.body = AsyncMock(return_value=b"{}")
    request.headers.get.return_value = "sig"

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    db.flush.side_effect = IntegrityError("insert", {}, Exception("duplicate"))

    event = {"id": "evt_race", "type": "invoice.payment_failed", "data": {"object": {"customer": "cus_x"}}}

    with patch("billing.stripe_routes.settings") as mock_settings:
        mock_settings.stripe_secret_key = "sk_test"
        mock_settings.stripe_price_professional = "price_test"
        mock_settings.stripe_webhook_secret = "whsec_test"

        with patch("billing.stripe_routes.stripe.Webhook.construct_event", return_value=event):
            result = await stripe_webhook(request, db)
            assert result == {"status": "already_processed"}
            db.rollback.assert_called_once()
