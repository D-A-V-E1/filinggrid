"""One-off E2E checkout + webhook smoke test (loads secrets from backend/.env)."""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import jwt
import stripe

from config import get_settings
from database import Organization, SessionLocal, Subscription

settings = get_settings()
stripe.api_key = settings.stripe_secret_key

TEST_EMAIL = "e2e-checkout@testcorp.com"


def _make_token() -> str:
    now = int(time.time())
    payload = {
        "sub": "e2e-test-user-id",
        "email": TEST_EMAIL,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": now,
        "exp": now + 3600,
    }
    secret = settings.supabase_jwt_secret_effective
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET not configured for HS256 test token")
    return jwt.encode(payload, secret, algorithm="HS256")


def _post_checkout(token: str) -> dict:
    body = json.dumps(
        {"email": TEST_EMAIL, "return_path": "/compare/aapl-vs-msft"}
    ).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:8000/billing/checkout",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def _sign_webhook_payload(payload: str) -> str:
    """Build a Stripe-Signature header for local webhook testing."""
    timestamp = int(time.time())
    signed = f"{timestamp}.{payload}"
    sig = stripe.WebhookSignature._compute_signature(signed, settings.stripe_webhook_secret)
    return f"t={timestamp},v1={sig}"


def _simulate_webhook_event(event: dict) -> int:
    """POST a signed Stripe event to the webhook endpoint."""
    payload = json.dumps(event)
    sig = _sign_webhook_payload(payload)
    req = urllib.request.Request(
        "http://127.0.0.1:8000/webhooks/stripe",
        data=payload.encode(),
        headers={"stripe-signature": sig, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status


def _active_subscription_payload(subscription_id: str, customer_id: str, price_id: str) -> dict:
    period_end = int(time.time()) + 30 * 24 * 3600
    return {
        "id": subscription_id,
        "customer": customer_id,
        "status": "active",
        "current_period_end": period_end,
        "cancel_at_period_end": False,
        "items": {"data": [{"price": {"id": price_id}}]},
    }


def _ensure_active_test_subscription(customer_id: str) -> str:
    """Attach a test card and create an active subscription for webhook retrieval."""
    pm = stripe.PaymentMethod.create(
        type="card",
        card={"token": "tok_visa"},
    )
    stripe.PaymentMethod.attach(pm.id, customer=customer_id)
    stripe.Customer.modify(
        customer_id,
        invoice_settings={"default_payment_method": pm.id},
    )
    sub = stripe.Subscription.create(
        customer=customer_id,
        items=[{"price": settings.stripe_price_professional}],
        default_payment_method=pm.id,
    )
    return sub.id


def _simulate_checkout_completed(org_id: str, customer_id: str, subscription_id: str) -> int:
    event = {
        "id": f"evt_e2e_cs_{int(time.time())}",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_e2e_test",
                "customer": customer_id,
                "subscription": subscription_id,
                "metadata": {"organization_id": org_id},
            }
        },
    }
    return _simulate_webhook_event(event)


def _simulate_subscription_updated(customer_id: str, subscription: dict) -> int:
    event = {
        "id": f"evt_e2e_sub_{int(time.time())}",
        "type": "customer.subscription.updated",
        "data": {"object": subscription},
    }
    return _simulate_webhook_event(event)


def main() -> int:
    print("=== Step 3: Stripe price retrieval ===")
    price = stripe.Price.retrieve(settings.stripe_price_professional)
    print(f"OK price={price.id} active={price.active} amount={price.unit_amount}")

    print("\n=== Step 4: POST /billing/checkout ===")
    token = _make_token()
    try:
        result = _post_checkout(token)
    except urllib.error.HTTPError as exc:
        print(f"FAIL status={exc.code} body={exc.read().decode()}")
        return 1
    checkout_url = result.get("checkout_url", "")
    print(f"OK checkout_url starts with: {checkout_url[:60]}...")

    db = SessionLocal()
    org = db.query(Organization).filter(Organization.name == "E2e-Checkout").first()
    if not org:
        from database import User

        user = db.query(User).filter(User.email == TEST_EMAIL).first()
        org = user.organization if user else None
    if not org:
        print("FAIL could not find org after checkout")
        return 1
    print(f"OK org_id={org.id} stripe_customer_id={org.stripe_customer_id}")

    print("\n=== Step 5a: Webhook tier upgrade (checkout.session.completed) ===")
    sub_id = _ensure_active_test_subscription(org.stripe_customer_id)
    status = _simulate_checkout_completed(org.id, org.stripe_customer_id, sub_id)
    print(f"OK webhook status={status}")

    db.refresh(org)
    sub_row = db.query(Subscription).filter(Subscription.organization_id == org.id).first()
    print(f"OK org.subscription_tier={org.subscription_tier}")
    print(f"OK subscription.status={sub_row.status if sub_row else None}")

    if org.subscription_tier != "professional":
        print("\n=== Step 5b: Webhook tier upgrade (customer.subscription.updated) ===")
        sub = stripe.Subscription.retrieve(sub_id)
        status = _simulate_subscription_updated(
            org.stripe_customer_id,
            _active_subscription_payload(sub.id, org.stripe_customer_id, settings.stripe_price_professional),
        )
        print(f"OK webhook status={status}")
        db.refresh(org)
        sub_row = db.query(Subscription).filter(Subscription.organization_id == org.id).first()
        print(f"OK org.subscription_tier={org.subscription_tier}")
        print(f"OK subscription.status={sub_row.status if sub_row else None}")

    # Cleanup test subscription
    try:
        stripe.Subscription.cancel(sub_id)
    except Exception:
        pass

    db.close()
    return 0 if org.subscription_tier == "professional" else 1


if __name__ == "__main__":
    sys.exit(main())
