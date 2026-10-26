"""audit window: end date and when it was scheduled

A scheduled audit gets an end (due_at) so a start-to-end window and its
duration can be shown, and an audit not finished by its end is overdue.
Audits also get created_at, so it shows when they were booked.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-26 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0008'
down_revision: Union[str, None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('audits', schema=None) as batch_op:
        batch_op.add_column(sa.Column('due_at', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('audits', schema=None) as batch_op:
        batch_op.drop_column('created_at')
        batch_op.drop_column('due_at')
