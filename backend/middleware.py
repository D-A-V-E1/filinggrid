"""JWT validation, subscription tier gates, and usage limits."""

from datetime import datetime
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from config import get_settings
from database import Organization, SessionLocal, User, get_db

settings = get_settings()
security = HTTPBearer(auto_error=False)

CONSUMER_EMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "aol.com", "protonmail.com", "mail.com",
}

TIER_LIMITS = {
    "free": {
        "max_columns": 3,
        "historical": False,
        "current_year_only": True,
    },
    "professional": {
        "max_columns": 8,
        "historical": True,
        "current_year_only": False,
    },
}


class AuthContext:
    def __init__(
        self,
        user: Optional[User] = None,
        organization: Optional[Organization] = None,
        tier: str = "free",
        is_authenticated: bool = False,
    ):
        self.user = user
        self.organization = organization
        self.tier = tier
        self.is_authenticated = is_authenticated

    @property
    def limits(self) -> dict:
        return TIER_LIMITS.get(self.tier, TIER_LIMITS["free"])


def resolve_effective_tier(request: Request, org_tier: str) -> str:
    """Apply dev/test tier overrides when ALLOW_DEV_TIER_TOGGLE is enabled."""
    tier = org_tier if org_tier in TIER_LIMITS else "free"
    if not settings.allow_dev_tier_toggle:
        return tier

    header_tier = (request.headers.get("x-dev-tier") or "").strip().lower()
    if header_tier in TIER_LIMITS:
        return header_tier

    if settings.dev_pro_tier:
        return "professional"

    return tier


def decode_jwt(token: str) -> dict:
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_NOT_CONFIGURED", "message": "Authentication is not configured."},
        )
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Session expired. Please sign in again."},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": str(exc)},
        )


def get_or_create_user(db: Session, email: str) -> tuple[User, Organization]:
    user = db.query(User).filter(User.email == email).first()
    if user and user.organization:
        return user, user.organization

    org = Organization(name=email.split("@")[0].title(), subscription_tier="free")
    db.add(org)
    db.flush()

    if user:
        user.organization_id = org.id
    else:
        user = User(email=email, organization_id=org.id, role="owner")
        db.add(user)

    db.commit()
    db.refresh(user)
    db.refresh(org)
    return user, org


async def get_auth_context(
    request: Request,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)] = None,
    db: Session = Depends(get_db),
) -> AuthContext:
    if not credentials:
        return AuthContext(
            tier=resolve_effective_tier(request, "free"),
            is_authenticated=False,
        )

    if not settings.supabase_jwt_secret:
        return AuthContext(
            tier=resolve_effective_tier(request, "free"),
            is_authenticated=False,
        )

    payload = decode_jwt(credentials.credentials)
    email = payload.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        user, org = get_or_create_user(db, email)
    except Exception:
        return AuthContext(tier="free", is_authenticated=False)

    db.info["current_org_id"] = org.id

    tier = resolve_effective_tier(request, org.subscription_tier or "free")

    return AuthContext(user=user, organization=org, tier=tier, is_authenticated=True)


async def require_auth(auth: Annotated[AuthContext, Depends(get_auth_context)]) -> AuthContext:
    if not auth.is_authenticated:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth


async def get_peer_group_auth(
    request: Request,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)] = None,
    db: Session = Depends(get_db),
) -> AuthContext:
    """Auth for saved peer groups — signed-in users, or anonymous dev Pro when toggle is enabled."""
    auth = await get_auth_context(request, credentials, db)
    if auth.is_authenticated and auth.organization:
        return auth

    if settings.allow_dev_tier_toggle and resolve_effective_tier(request, "free") == "professional":
        from peer_groups_service import DevPeerOrganization

        return AuthContext(
            organization=DevPeerOrganization(),
            tier="professional",
            is_authenticated=True,
        )

    raise HTTPException(status_code=401, detail="Authentication required")


def validate_corporate_email(email: str) -> None:
    domain = email.split("@")[-1].lower()
    if domain in CONSUMER_EMAIL_DOMAINS:
        raise HTTPException(
            status_code=400,
            detail="Professional tier requires a corporate email address.",
        )


def check_parse_access(
    auth: AuthContext,
    ticker_count: int,
    fiscal_year: Optional[int] = None,
) -> None:
    limits = auth.limits
    current_year = datetime.now().year

    if ticker_count > limits["max_columns"]:
        if auth.tier == "professional":
            message = (
                f"Professional supports up to {limits['max_columns']} tickers. "
                "Remove a ticker before adding another."
            )
        else:
            message = (
                f"Free tier supports up to {limits['max_columns']} tickers. "
                "Upgrade to Professional for up to 8."
            )
        raise HTTPException(
            status_code=402,
            detail={
                "code": "PAYWALL",
                "reason": "column_limit",
                "message": message,
                "max_columns": limits["max_columns"],
                "requested": ticker_count,
            },
        )

    if fiscal_year and fiscal_year < current_year and not limits["historical"]:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "PAYWALL",
                "reason": "historical_data",
                "message": "Historical filings require a Professional subscription.",
                "requested_year": fiscal_year,
            },
        )


def check_professional_access(auth: AuthContext) -> None:
    if auth.tier != "professional":
        raise HTTPException(
            status_code=402,
            detail={
                "code": "PAYWALL",
                "reason": "subscription_required",
                "message": "This feature requires a Professional subscription.",
            },
        )
