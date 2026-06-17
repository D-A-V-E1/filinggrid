"""JWT validation, subscription tier gates, and usage limits."""

from datetime import datetime
from typing import Annotated, Optional

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from config import get_settings
from database import Organization, SessionLocal, User, get_db

settings = get_settings()
security = HTTPBearer(auto_error=False)

_jwks_client: Optional[PyJWKClient] = None
_jwks_client_url: Optional[str] = None


def _get_jwks_client() -> Optional[PyJWKClient]:
    global _jwks_client, _jwks_client_url
    jwks_url = settings.supabase_jwks_url_resolved
    if not jwks_url:
        return None
    if _jwks_client is None or _jwks_client_url != jwks_url:
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
        _jwks_client_url = jwks_url
    return _jwks_client

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


def _decode_jwt_jwks(token: str) -> dict:
    client = _get_jwks_client()
    if not client:
        raise jwt.InvalidTokenError("JWKS not configured")
    signing_key = client.get_signing_key_from_jwt(token)
    decode_kwargs: dict = {
        "algorithms": ["ES256", "RS256"],
        "audience": "authenticated",
    }
    if settings.supabase_url.strip() and not settings.supabase_url.strip().upper().startswith("TODO"):
        decode_kwargs["issuer"] = f"{settings.supabase_url.rstrip('/')}/auth/v1"
    return jwt.decode(token, signing_key.key, **decode_kwargs)


def _decode_jwt_hs256(token: str) -> dict:
    secret = settings.supabase_jwt_secret_effective
    if not secret:
        raise jwt.InvalidTokenError("HS256 secret not configured")
    return jwt.decode(
        token,
        secret,
        algorithms=["HS256"],
        audience="authenticated",
    )


def decode_jwt(token: str) -> dict:
    if not settings.auth_configured:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_NOT_CONFIGURED", "message": "Authentication is not configured."},
        )

    jwks_configured = bool(settings.supabase_jwks_url_resolved)
    legacy_configured = bool(settings.supabase_jwt_secret_effective)
    last_error: Optional[jwt.InvalidTokenError] = None

    if jwks_configured:
        try:
            return _decode_jwt_jwks(token)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "TOKEN_EXPIRED", "message": "Session expired. Please sign in again."},
            )
        except jwt.InvalidTokenError as exc:
            last_error = exc
            if not legacy_configured:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={"code": "INVALID_TOKEN", "message": str(exc)},
                )

    if legacy_configured:
        try:
            return _decode_jwt_hs256(token)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "TOKEN_EXPIRED", "message": "Session expired. Please sign in again."},
            )
        except jwt.InvalidTokenError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_TOKEN", "message": str(last_error or exc)},
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "AUTH_NOT_CONFIGURED", "message": "Authentication is not configured."},
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

    if not settings.auth_configured:
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
