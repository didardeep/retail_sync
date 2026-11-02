"""alerts and annexures: notifications, a mail address for them, audit files

Logins are plain usernames, so users.notify_email holds where alert mail goes.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-02 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0009'
down_revision: Union[str, None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notify_email', sa.String(length=200), nullable=True))

    op.create_table(
        'notifications',
        sa.Column('id', sa.String(length=12), nullable=False),
        sa.Column('user_id', sa.String(length=12), nullable=False),
        sa.Column('kind', sa.String(length=30), nullable=False),
        sa.Column('title', sa.String(length=300), nullable=False),
        sa.Column('link', sa.String(length=200), nullable=True),
        sa.Column('dedupe_key', sa.String(length=120), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('emailed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notifications_user_id_users')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications')),
        sa.UniqueConstraint('user_id', 'dedupe_key', name='uq_notifications_user_key'),
    )
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_notifications_user_id'), ['user_id'], unique=False)

    op.create_table(
        'annexures',
        sa.Column('id', sa.String(length=12), nullable=False),
        sa.Column('audit_id', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('file_name', sa.String(length=240), nullable=False),
        sa.Column('stored_name', sa.String(length=60), nullable=False),
        sa.Column('uploaded_by_id', sa.String(length=12), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['audit_id'], ['audits.id'], name=op.f('fk_annexures_audit_id_audits')),
        sa.ForeignKeyConstraint(['uploaded_by_id'], ['users.id'], name=op.f('fk_annexures_uploaded_by_id_users')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_annexures')),
    )
    with op.batch_alter_table('annexures', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_annexures_audit_id'), ['audit_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('annexures', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_annexures_audit_id'))
    op.drop_table('annexures')
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_notifications_user_id'))
    op.drop_table('notifications')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('notify_email')
