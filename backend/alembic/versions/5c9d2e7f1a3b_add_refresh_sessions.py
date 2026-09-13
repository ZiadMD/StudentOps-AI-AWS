"""add refresh sessions

Revision ID: 5c9d2e7f1a3b
Revises: 4b8c9d0e1f2a
Create Date: 2026-09-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5c9d2e7f1a3b"
down_revision: Union[str, Sequence[str], None] = "4b8c9d0e1f2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if "refresh_sessions" not in sa.inspect(bind).get_table_names():
        op.create_table(
            "refresh_sessions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("refresh_token_jti", sa.String(length=36), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("refresh_token_jti"),
        )
        op.create_index(op.f("ix_refresh_sessions_id"), "refresh_sessions", ["id"], unique=False)
        op.create_index(op.f("ix_refresh_sessions_user_id"), "refresh_sessions", ["user_id"], unique=False)
        op.create_index(op.f("ix_refresh_sessions_refresh_token_jti"), "refresh_sessions", ["refresh_token_jti"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    if "refresh_sessions" in sa.inspect(bind).get_table_names():
        op.drop_index(op.f("ix_refresh_sessions_refresh_token_jti"), table_name="refresh_sessions")
        op.drop_index(op.f("ix_refresh_sessions_user_id"), table_name="refresh_sessions")
        op.drop_index(op.f("ix_refresh_sessions_id"), table_name="refresh_sessions")
        op.drop_table("refresh_sessions")
