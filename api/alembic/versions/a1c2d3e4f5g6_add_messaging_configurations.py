"""add messaging configurations and whatsapp sessions

Revision ID: a1c2d3e4f5g6
Revises: f2e1d0c9b8a7
Create Date: 2026-07-18 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1c2d3e4f5g6"
down_revision: Union[str, None] = "f2e1d0c9b8a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "messaging_configurations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False, server_default="whatsapp_cloud"),
        sa.Column("credentials", sa.JSON(), nullable=False),
        sa.Column("inbound_workflow_id", sa.Integer(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("webhook_verify_token", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["inbound_workflow_id"], ["workflows.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messaging_configurations_id", "messaging_configurations", ["id"])
    op.create_index("ix_messaging_configurations_org", "messaging_configurations", ["organization_id"])
    op.create_index(
        "uq_messaging_configurations_org_name",
        "messaging_configurations",
        ["organization_id", "name"],
        unique=True,
    )
    op.create_index(
        "uq_messaging_configurations_default",
        "messaging_configurations",
        ["organization_id"],
        unique=True,
        postgresql_where=sa.text("is_default = true"),
    )

    op.create_table(
        "whatsapp_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("messaging_configuration_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("workflow_id", sa.Integer(), nullable=False),
        sa.Column("workflow_run_id", sa.Integer(), nullable=True),
        sa.Column("sender_phone_number", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("auto_reply", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["messaging_configuration_id"], ["messaging_configurations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workflow_id"], ["workflows.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["workflow_run_id"], ["workflow_runs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_whatsapp_sessions_id", "whatsapp_sessions", ["id"])
    op.create_index("ix_whatsapp_sessions_org", "whatsapp_sessions", ["organization_id"])
    op.create_index("ix_whatsapp_sessions_config", "whatsapp_sessions", ["messaging_configuration_id"])
    op.create_index(
        "ix_whatsapp_sessions_sender_active",
        "whatsapp_sessions",
        ["messaging_configuration_id", "sender_phone_number"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index("ix_whatsapp_sessions_last_message", "whatsapp_sessions", ["last_message_at"])

    # Add channel and messaging_configuration_id to campaigns
    op.add_column(
        "campaigns",
        sa.Column("channel", sa.String(16), nullable=False, server_default=sa.text("'telephony'")),
    )
    op.add_column(
        "campaigns",
        sa.Column("messaging_configuration_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_campaigns_messaging_configuration",
        "campaigns",
        "messaging_configurations",
        ["messaging_configuration_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_campaigns_messaging_configuration", "campaigns", type_="foreignkey")
    op.drop_column("campaigns", "messaging_configuration_id")
    op.drop_column("campaigns", "channel")

    op.drop_index("ix_whatsapp_sessions_last_message", table_name="whatsapp_sessions")
    op.drop_index("ix_whatsapp_sessions_sender_active", table_name="whatsapp_sessions")
    op.drop_index("ix_whatsapp_sessions_config", table_name="whatsapp_sessions")
    op.drop_index("ix_whatsapp_sessions_org", table_name="whatsapp_sessions")
    op.drop_index("ix_whatsapp_sessions_id", table_name="whatsapp_sessions")
    op.drop_table("whatsapp_sessions")

    op.drop_index("uq_messaging_configurations_default", table_name="messaging_configurations")
    op.drop_index("uq_messaging_configurations_org_name", table_name="messaging_configurations")
    op.drop_index("ix_messaging_configurations_org", table_name="messaging_configurations")
    op.drop_index("ix_messaging_configurations_id", table_name="messaging_configurations")
    op.drop_table("messaging_configurations")
