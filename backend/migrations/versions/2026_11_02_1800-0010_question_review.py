"""question review: the audit manager approves or queries each answer

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-02 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('audit_responses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('review_status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('review_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('review_reply', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('reviewed_by_id', sa.String(length=12), nullable=True))
        batch_op.add_column(sa.Column('reviewed_at', sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            batch_op.f('fk_audit_responses_reviewed_by_id_users'), 'users', ['reviewed_by_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('audit_responses', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_audit_responses_reviewed_by_id_users'), type_='foreignkey')
        batch_op.drop_column('reviewed_at')
        batch_op.drop_column('reviewed_by_id')
        batch_op.drop_column('review_reply')
        batch_op.drop_column('review_note')
        batch_op.drop_column('review_status')
