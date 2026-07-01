"""Application configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # Database
    database_url: str = "postgresql://filinggrid:filinggrid@localhost:5432/filinggrid"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: object) -> object:
        if isinstance(v, str) and v.startswith("postgres://"):
            return "postgresql://" + v[len("postgres://") :]
        return v

    # SEC EDGAR
    sec_user_agent: str = "PeerDisclosures/1.0 (contact@peerdisclosures.com)"
    filing_cache_enabled: bool = True
    filing_cache_dir: str = ".cache/filings"

    # Supabase JWT validation (JWKS ES256 preferred; HS256 legacy fallback)
    supabase_url: str = Field(
        default="",
        validation_alias=AliasChoices("supabase_url", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    )
    supabase_jwks_url: str = ""
    supabase_jwt_secret: str = ""
    supabase_service_role_key: str = ""

    @staticmethod
    def _is_real_env_value(value: str) -> bool:
        v = value.strip()
        if not v:
            return False
        return not v.upper().startswith("TODO")

    @property
    def supabase_jwks_url_resolved(self) -> str:
        if self._is_real_env_value(self.supabase_jwks_url):
            return self.supabase_jwks_url.strip()
        if self._is_real_env_value(self.supabase_url):
            return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        return ""

    @property
    def supabase_jwt_secret_effective(self) -> str:
        if self._is_real_env_value(self.supabase_jwt_secret):
            return self.supabase_jwt_secret.strip()
        return ""

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_jwks_url_resolved or self.supabase_jwt_secret_effective)

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_professional: str = Field(
        default="",
        validation_alias=AliasChoices("STRIPE_PRICE_PROFESSIONAL", "STRIPE_PRICE_ID_PRO"),
    )
    app_url: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("APP_URL", "FRONTEND_URL"),
    )

    # Heavy endpoint concurrency cap (parse stream, financials batch, section excerpt)
    max_concurrent_heavy: int = Field(
        default=3,
        validation_alias=AliasChoices("MAX_CONCURRENT_PARSE", "max_concurrent_heavy"),
    )

    # CORS
    cors_origins: str = "http://localhost:3000"

    # Dev/test tier override (never enable in production without explicit intent)
    allow_dev_tier_toggle: bool = False
    dev_pro_tier: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
