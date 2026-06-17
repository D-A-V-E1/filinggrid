"""Application configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql://filinggrid:filinggrid@localhost:5432/filinggrid"

    # SEC EDGAR
    sec_user_agent: str = "FilingGrid/1.0 (contact@filinggrid.com)"
    filing_cache_enabled: bool = True
    filing_cache_dir: str = ".cache/filings"

    # Supabase JWT validation (JWKS ES256 preferred; HS256 legacy fallback)
    supabase_url: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
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
