"""Initial schema."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("subscription_tier", sa.String(50), server_default="free"),
        sa.Column("stripe_customer_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_organizations_stripe_customer_id", "organizations", ["stripe_customer_id"])

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), server_default="member"),
        sa.Column("organization_id", sa.UUID(as_uuid=False), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "saved_peer_groups",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("organization_id", sa.UUID(as_uuid=False), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("group_name", sa.String(255), nullable=False),
        sa.Column("tickers_list", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_saved_peer_groups_organization_id", "saved_peer_groups", ["organization_id"])

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("organization_id", sa.UUID(as_uuid=False), sa.ForeignKey("organizations.id"), unique=True, nullable=False),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(50), server_default="inactive"),
        sa.Column("price_id", sa.String(255), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_subscriptions_stripe_subscription_id", "subscriptions", ["stripe_subscription_id"])

    op.create_table(
        "stripe_events",
        sa.Column("event_id", sa.String(255), primary_key=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "usage_events",
        sa.Column("id", sa.UUID(as_uuid=False), primary_key=True),
        sa.Column("organization_id", sa.UUID(as_uuid=False), nullable=True),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_usage_events_organization_id", "usage_events", ["organization_id"])

    op.execute("ALTER TABLE saved_peer_groups ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY org_isolation_saved_peer_groups ON saved_peer_groups
        USING (organization_id::text = current_setting('app.current_org_id', true))
        """
    )
    op.execute(
        """
        CREATE POLICY org_isolation_usage_events ON usage_events
        USING (
            organization_id IS NULL
            OR organization_id::text = current_setting('app.current_org_id', true)
        )
        """
    )


def downgrade() -> None:
    op.drop_table("usage_events")
    op.drop_table("stripe_events")
    op.drop_table("subscriptions")
    op.drop_table("saved_peer_groups")
    op.drop_table("users")
    op.drop_table("organizations")
