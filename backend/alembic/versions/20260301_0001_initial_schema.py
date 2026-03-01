"""Initial project and circuit schema.

Revision ID: 20260301_0001
Revises:
Create Date: 2026-03-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260301_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "circuits",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False, server_default="Main"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("graph_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("validation_errors", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("intent_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("components_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("bom_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("pcb_constraints_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("source_description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_circuits_project_id", "circuits", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_circuits_project_id", table_name="circuits")
    op.drop_table("circuits")
    op.drop_table("projects")
