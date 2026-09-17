"""Add optional, case-insensitively unique usernames.

Revision ID: 6d0e3f8a2b4c
Revises: 5c9d2e7f1a3b

Expand-only rollout: existing accounts retain NULL until they choose a username.
Apply before deploying application code that reads users.username. No names are
inferred from email addresses or internal IDs, and existing credentials remain
unchanged. Roll back application code before downgrading this migration.
"""
from alembic import op
import sqlalchemy as sa

revision = "6d0e3f8a2b4c"
down_revision = "5c9d2e7f1a3b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(32), nullable=True))
    # NULLs remain distinct on PostgreSQL and SQLite; mixed-case names do not.
    op.create_index("uq_users_username_lower", "users", [sa.text("lower(username)")], unique=True)


def downgrade() -> None:
    op.drop_index("uq_users_username_lower", table_name="users")
    op.drop_column("users", "username")
