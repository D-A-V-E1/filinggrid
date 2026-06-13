"""PostgreSQL SQLAlchemy schema for users, organizations, and subscriptions."""

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    create_engine,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from config import get_settings

settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), default="member")
    organization_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    organization: Mapped[Optional["Organization"]] = relationship(back_populates="users")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subscription_tier: Mapped[str] = mapped_column(String(50), default="free")
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    users: Mapped[list["User"]] = relationship(back_populates="organization")
    saved_peer_groups: Mapped[list["SavedPeerGroup"]] = relationship(back_populates="organization")
    subscription: Mapped[Optional["Subscription"]] = relationship(
        back_populates="organization", uselist=False
    )


class SavedPeerGroup(Base):
    __tablename__ = "saved_peer_groups"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    organization_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False, index=True
    )
    group_name: Mapped[str] = mapped_column(String(255), nullable=False)
    tickers_list: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    organization: Mapped["Organization"] = relationship(back_populates="saved_peer_groups")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    organization_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("organizations.id"), unique=True, nullable=False
    )
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(50), default="inactive")
    price_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    organization: Mapped["Organization"] = relationship(back_populates="subscription")


class StripeEvent(Base):
    __tablename__ = "stripe_events"

    event_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class UsageEvent(Base):
    __tablename__ = "usage_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    organization_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    _apply_rls_policies()


def _apply_rls_policies() -> None:
    """Enable Row-Level Security hooks for multi-tenant organizational data isolation."""
    policies = [
        "ALTER TABLE saved_peer_groups ENABLE ROW LEVEL SECURITY",
        "ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY",
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'saved_peer_groups'
                AND policyname = 'org_isolation_saved_peer_groups'
            ) THEN
                CREATE POLICY org_isolation_saved_peer_groups ON saved_peer_groups
                USING (organization_id::text = current_setting('app.current_org_id', true));
            END IF;
        END $$;
        """,
        """
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies WHERE tablename = 'usage_events'
                AND policyname = 'org_isolation_usage_events'
            ) THEN
                CREATE POLICY org_isolation_usage_events ON usage_events
                USING (
                    organization_id IS NULL
                    OR organization_id::text = current_setting('app.current_org_id', true)
                );
            END IF;
        END $$;
        """,
    ]
    with engine.connect() as conn:
        for policy in policies:
            conn.execute(text(policy))
        conn.commit()


@event.listens_for(SessionLocal, "after_begin")
def set_rls_context(session, transaction, connection):
    org_id = session.info.get("current_org_id")
    if org_id:
        connection.execute(
            text("SELECT set_config('app.current_org_id', :org_id, true)"),
            {"org_id": str(org_id)},
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
