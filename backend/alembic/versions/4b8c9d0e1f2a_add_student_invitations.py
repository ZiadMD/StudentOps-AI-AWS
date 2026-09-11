"""add_student_invitations

Revision ID: 4b8c9d0e1f2a
Revises: 3f35fadc1e13
Create Date: 2026-09-11 17:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b8c9d0e1f2a'
down_revision: Union[str, Sequence[str], None] = '3f35fadc1e13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add student_invitations table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'student_invitations' not in existing_tables:
        op.create_table(
            'student_invitations',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('student_id', sa.String(length=36), nullable=False),
            sa.Column('token_hash', sa.String(length=64), nullable=False),
            sa.Column('created_by_user_id', sa.String(length=36), nullable=True),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('is_used', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('used_by_user_id', sa.String(length=36), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['used_by_user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_student_invitations_id'), 'student_invitations', ['id'], unique=False)
        op.create_index(op.f('ix_student_invitations_student_id'), 'student_invitations', ['student_id'], unique=False)
        op.create_index(op.f('ix_student_invitations_token_hash'), 'student_invitations', ['token_hash'], unique=True)
        op.create_index(op.f('ix_student_invitations_created_by_user_id'), 'student_invitations', ['created_by_user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema to remove student_invitations table."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'student_invitations' in existing_tables:
        op.drop_index(op.f('ix_student_invitations_created_by_user_id'), table_name='student_invitations')
        op.drop_index(op.f('ix_student_invitations_token_hash'), table_name='student_invitations')
        op.drop_index(op.f('ix_student_invitations_student_id'), table_name='student_invitations')
        op.drop_index(op.f('ix_student_invitations_id'), table_name='student_invitations')
        op.drop_table('student_invitations')
