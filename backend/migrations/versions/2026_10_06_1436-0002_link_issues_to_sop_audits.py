"""link issues to sop audits

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-06 14:36:54.115564

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('issues', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sop_audit_id', sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column('sop_criterion_id', sa.String(length=12), nullable=True))
        batch_op.create_index(batch_op.f('ix_issues_sop_audit_id'), ['sop_audit_id'], unique=False)
        batch_op.create_foreign_key(batch_op.f('fk_issues_sop_criterion_id_sop_criteria'), 'sop_criteria', ['sop_criterion_id'], ['id'])
        batch_op.create_foreign_key(batch_op.f('fk_issues_sop_audit_id_sop_audits'), 'sop_audits', ['sop_audit_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('issues', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_issues_sop_audit_id_sop_audits'), type_='foreignkey')
        batch_op.drop_constraint(batch_op.f('fk_issues_sop_criterion_id_sop_criteria'), type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_issues_sop_audit_id'))
        batch_op.drop_column('sop_criterion_id')
        batch_op.drop_column('sop_audit_id')
