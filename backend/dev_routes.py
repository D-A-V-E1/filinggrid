"""Dev/test-only endpoints for subscription tier toggling (no Stripe)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import get_settings
from database import get_db
from middleware import AuthContext, TIER_LIMITS, get_auth_context, require_auth

settings = get_settings()
router = APIRouter(prefix="/dev", tags=["dev"])


class SetTierRequest(BaseModel):
    tier: str


class SetTierResponse(BaseModel):
    tier: str
    organization_id: str
    message: str


def _ensure_dev_toggle_allowed() -> None:
    if not settings.allow_dev_tier_toggle:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/tier", response_model=SetTierResponse)
async def set_dev_tier(
    body: SetTierRequest,
    auth: Annotated[AuthContext, Depends(require_auth)],
    db: Session = Depends(get_db),
):
    """Persist subscription tier on the signed-in user's organization (dev/test only)."""
    _ensure_dev_toggle_allowed()

    tier = body.tier.strip().lower()
    if tier not in TIER_LIMITS:
        raise HTTPException(status_code=400, detail=f"Invalid tier. Use one of: {', '.join(TIER_LIMITS)}")

    org = auth.organization
    if not org:
        raise HTTPException(status_code=400, detail="No organization for user")

    org.subscription_tier = tier
    db.commit()
    db.refresh(org)

    return SetTierResponse(
        tier=tier,
        organization_id=org.id,
        message=f"Organization tier set to {tier}. Refresh the page to pick up limits.",
    )


@router.get("/tier")
async def get_dev_tier_info(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
):
    """Show effective tier and whether dev overrides are active."""
    _ensure_dev_toggle_allowed()

    stored = auth.organization.subscription_tier if auth.organization else None
    return {
        "effective_tier": auth.tier,
        "stored_tier": stored,
        "limits": auth.limits,
        "dev_pro_tier_env": settings.dev_pro_tier,
        "allow_dev_tier_toggle": settings.allow_dev_tier_toggle,
    }
