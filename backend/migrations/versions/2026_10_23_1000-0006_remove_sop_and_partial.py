"""remove SOP audits and old audit data

SOP audits are no longer part of the product, so the SOP tables and the two
SOP columns on issues are dropped. The "Partial" answer is also gone, so the
existing checklist audit data (audits, answers and the issues raised from
them) is deleted; it is rebuilt with Yes / No / NA answers only. Issues created
by hand (no audit) and the observations are kept.

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: Union[str, None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Old audit data: issues raised from audits first, then answers, then audits.
    op.execute("DELETE FROM issues WHERE audit_id IS NOT NULL OR response_id IS NOT NULL "
               "OR sop_audit_id IS NOT NULL")
    op.execute("UPDATE observations SET audit_id = NULL")
    op.execute("DELETE FROM audit_responses")
    op.execute("DELETE FROM audits")

    with op.batch_alter_table('issues', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_issues_sop_audit_id_sop_audits'), type_='foreignkey')
        batch_op.drop_constraint(batch_op.f('fk_issues_sop_criterion_id_sop_criteria'), type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_issues_sop_audit_id'))
        batch_op.drop_column('sop_criterion_id')
        batch_op.drop_column('sop_audit_id')

    op.drop_table('sop_attachments')
    op.drop_table('sop_audit_scores')
    op.drop_table('sop_audits')
    op.drop_table('sop_criteria')
    op.drop_table('sop_sections')
    op.drop_table('sop_templates')


def downgrade() -> None:
    raise NotImplementedError("SOP audits were removed and the audit data deleted; "
                              "this migration cannot be reversed.")
