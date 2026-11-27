"""planned audits with nothing answered use the current question versions

From now on an edit moves Planned audits that nobody has started; this brings
the ones scheduled before that onto their questions' current versions. Audits
with any answer are not touched.

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-26 12:00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0020'
down_revision: Union[str, None] = '0019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE audit_responses
        SET question_id = COALESCE((
            SELECT cur.id FROM questions cur
            WHERE cur.is_current
              AND cur.code = (SELECT old.code FROM questions old
                              WHERE old.id = audit_responses.question_id)
            ORDER BY cur.version DESC
            LIMIT 1
        ), question_id)
        WHERE question_id IN (SELECT id FROM questions WHERE NOT is_current)
          AND audit_id IN (
            SELECT a.id FROM audits a
            WHERE a.status = 'Planned'
              AND NOT EXISTS (
                SELECT 1 FROM audit_responses r
                WHERE r.audit_id = a.id AND COALESCE(r.answer, '') <> ''
              )
          )
    """)


def downgrade() -> None:
    # The old versions were only stale copies; there is nothing worth restoring.
    pass
