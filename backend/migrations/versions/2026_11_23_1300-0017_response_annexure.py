"""an answer can carry a filled-in annexure table

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-23 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0017'
down_revision: Union[str, None] = '0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('audit_responses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('annexure', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('audit_responses', schema=None) as batch_op:
        batch_op.drop_column('annexure')
