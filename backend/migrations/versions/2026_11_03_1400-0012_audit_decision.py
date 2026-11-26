"""audit decision: the manager's reason when an audit is returned or rejected

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-03 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('audits', schema=None) as batch_op:
        batch_op.add_column(sa.Column('decision_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('decision_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('audits', schema=None) as batch_op:
        batch_op.drop_column('decision_at')
        batch_op.drop_column('decision_note')
