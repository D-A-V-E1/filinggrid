"""Stripe Checkout, Customer Portal, and webhook handlers."""

from datetime import datetime, timezone
from typing import Annotated, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from config import get_settings
from database import Organization, StripeEvent, Subscription, UsageEvent, get_db
from middleware import AuthContext, get_auth_context, require_auth, validate_corporate_email

settings = get_settings()
router = APIRouter(prefix="/billing", tags=["billing"])

if settings.stripe_secret_key:
    stripe.api_key = settings.stripe_secret_key


class CheckoutRequest(BaseModel):
    email: Optional[EmailStr] = None


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalResponse(BaseModel):
    portal_url: str


class BillingStatusResponse(BaseModel):
    tier: str
    status: str
    current_period_end: Optional[str] = None
    cancel_at_period_end: bool = False


def _ensure_stripe_configured() -> None:
    if not settings.stripe_secret_key or not settings.stripe_price_professional:
        raise HTTPException(status_code=503, detail="Billing is not configured")


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: Session = Depends(get_db),
):
    _ensure_stripe_configured()
    email = body.email or (auth.user.email if auth.user else None)
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    validate_corporate_email(email)

    org = auth.organization
    assert org is not None

    if not org.stripe_customer_id:
        customer = stripe.Customer.create(
            email=email,
            metadata={"organization_id": org.id},
        )
        org.stripe_customer_id = customer.id
        db.commit()

    session = stripe.checkout.Session.create(
        customer=org.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": settings.stripe_price_professional, "quantity": 1}],
        success_url=f"{settings.app_url}/compare?checkout=success",
        cancel_url=f"{settings.app_url}/pricing?checkout=cancelled",
        metadata={"organization_id": org.id},
        allow_promotion_codes=True,
    )

    usage = UsageEvent(
        organization_id=org.id,
        event_type="checkout_started",
        metadata_json={"session_id": session.id},
    )
    db.add(usage)
    db.commit()

    return CheckoutResponse(checkout_url=session.url)


@router.post("/portal", response_model=PortalResponse)
async def create_portal(
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: Session = Depends(get_db),
):
    _ensure_stripe_configured()
    org = auth.organization
    assert org is not None

    if not org.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=org.stripe_customer_id,
        return_url=f"{settings.app_url}/compare",
    )
    return PortalResponse(portal_url=session.url)


@router.get("/status", response_model=BillingStatusResponse)
async def billing_status(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Session = Depends(get_db),
):
    if not auth.organization:
        return BillingStatusResponse(tier="free", status="inactive")

    sub = db.query(Subscription).filter(
        Subscription.organization_id == auth.organization.id
    ).first()

    return BillingStatusResponse(
        tier=auth.tier,
        status=sub.status if sub else "inactive",
        current_period_end=sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
        cancel_at_period_end=sub.cancel_at_period_end if sub else False,
    )


def _upsert_subscription(db: Session, org: Organization, stripe_sub: dict) -> None:
    sub = db.query(Subscription).filter(Subscription.organization_id == org.id).first()
    period_end = None
    if stripe_sub.get("current_period_end"):
        period_end = datetime.fromtimestamp(stripe_sub["current_period_end"], tz=timezone.utc)

    status_val = stripe_sub.get("status", "inactive")
    tier = "professional" if status_val in ("active", "trialing") else "free"
    org.subscription_tier = tier

    if not sub:
        sub = Subscription(organization_id=org.id)
        db.add(sub)

    sub.stripe_subscription_id = stripe_sub.get("id")
    sub.status = status_val
    sub.price_id = stripe_sub.get("items", {}).get("data", [{}])[0].get("price", {}).get("id")
    sub.current_period_end = period_end
    sub.cancel_at_period_end = stripe_sub.get("cancel_at_period_end", False)
    sub.updated_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    _ensure_stripe_configured()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    existing = db.query(StripeEvent).filter(StripeEvent.event_id == event.id).first()
    if existing:
        return {"status": "already_processed"}

    db.add(StripeEvent(event_id=event.id))
    db.commit()

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        org_id = data.get("metadata", {}).get("organization_id")
        customer_id = data.get("customer")
        if org_id and customer_id:
            org = db.query(Organization).filter(Organization.id == org_id).first()
            if org:
                org.stripe_customer_id = customer_id
                db.commit()
                if data.get("subscription"):
                    stripe_sub = stripe.Subscription.retrieve(data["subscription"])
                    _upsert_subscription(db, org, stripe_sub)

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        customer_id = data.get("customer")
        org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
        if org:
            _upsert_subscription(db, org, data)

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
        if org:
            org.subscription_tier = "free"
            sub = db.query(Subscription).filter(Subscription.organization_id == org.id).first()
            if sub:
                sub.status = "canceled"
                sub.updated_at = datetime.now(timezone.utc)
            db.commit()

    elif event_type == "invoice.payment_failed":
        customer_id = data.get("customer")
        org = db.query(Organization).filter(Organization.stripe_customer_id == customer_id).first()
        if org:
            sub = db.query(Subscription).filter(Subscription.organization_id == org.id).first()
            if sub:
                sub.status = "past_due"
                db.commit()

    return {"status": "ok"}
