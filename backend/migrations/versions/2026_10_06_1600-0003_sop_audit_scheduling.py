"""sop audit scheduling

A manager can schedule an SOP audit for an auditor (status Planned) before the
auditor starts it, so an audit needs a scheduled date, notes, and who scheduled it.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-06 16:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('sop_audits', schema=None) as batch_op:
        batch_op.add_column(sa.Column('scheduled_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('created_by_id', sa.String(length=12), nullable=True))
        batch_op.create_index(batch_op.f('ix_sop_audits_scheduled_at'), ['scheduled_at'], unique=False)
        batch_op.create_foreign_key(
            batch_op.f('fk_sop_audits_created_by_id_users'), 'users', ['created_by_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('sop_audits', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_sop_audits_created_by_id_users'), type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_sop_audits_scheduled_at'))
        batch_op.drop_column('created_by_id')
        batch_op.drop_column('notes')
        batch_op.drop_column('scheduled_at')
