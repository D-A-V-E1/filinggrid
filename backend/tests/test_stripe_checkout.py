"""Tests for Stripe checkout error handling (no live Stripe API)."""

from unittest.mock import MagicMock, patch

import pytest
import stripe
from fastapi import HTTPException

from billing.stripe_routes import _ensure_stripe_configured, _stripe_call, create_checkout
from middleware import AuthContext


def test_ensure_stripe_configured_raises_503_when_missing_keys():
    with patch("billing.stripe_routes.settings") as mock_settings:
        mock_settings.stripe_secret_key = ""
        mock_settings.stripe_price_professional = ""
        with pytest.raises(HTTPException) as exc:
            _ensure_stripe_configured()
        assert exc.value.status_code == 503


def test_stripe_call_maps_stripe_error_to_503():
    def boom():
        raise stripe.error.AuthenticationError("Invalid API Key")

    with pytest.raises(HTTPException) as exc:
        _stripe_call("create customer", boom)
    assert exc.value.status_code == 503
    assert "create customer" in exc.value.detail


@pytest.mark.anyio
async def test_create_checkout_returns_503_when_billing_not_configured():
    auth = AuthContext(is_authenticated=True)
    auth.user = MagicMock(email="buyer@testcorp.com")
    auth.organization = MagicMock(id="org-1", stripe_customer_id=None)

    body = MagicMock(email=None, return_path="/compare")
    db = MagicMock()

    with patch("billing.stripe_routes.settings") as mock_settings:
        mock_settings.stripe_secret_key = ""
        mock_settings.stripe_price_professional = ""
        with pytest.raises(HTTPException) as exc:
            await create_checkout(body, auth, db)
        assert exc.value.status_code == 503


@pytest.mark.anyio
async def test_create_checkout_allows_consumer_email():
    auth = AuthContext(is_authenticated=True)
    auth.user = MagicMock(email="analyst@gmail.com")
    org = MagicMock(id="org-1", stripe_customer_id="cus_existing")
    auth.organization = org

    body = MagicMock(email=None, return_path="/compare/aapl-vs-msft")
    db = MagicMock()

    mock_session = MagicMock()
    mock_session.id = "cs_test"
    mock_session.url = "https://checkout.stripe.com/test"

    with patch("billing.stripe_routes.settings") as mock_settings, patch(
        "billing.stripe_routes._stripe_call", side_effect=lambda _action, fn: fn()
    ), patch("billing.stripe_routes.stripe") as mock_stripe:
        mock_settings.stripe_secret_key = "sk_test"
        mock_settings.stripe_price_professional = "price_test"
        mock_settings.app_url = "https://example.com"
        mock_stripe.checkout.Session.create.return_value = mock_session

        result = await create_checkout(body, auth, db)

    assert result.checkout_url == "https://checkout.stripe.com/test"
    mock_stripe.checkout.Session.create.assert_called_once()
