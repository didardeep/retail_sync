"""checklist items point at the current version of their question

Editing a question used to leave checklists on the old version, so new audits
never saw the edit. Move every item that is behind onto its question's current
version. Audits already created are not touched.

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-26 10:00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0018'
down_revision: Union[str, None] = '0017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE checklist_items
        SET question_id = COALESCE((
            SELECT cur.id FROM questions cur
            WHERE cur.is_current
              AND cur.code = (SELECT old.code FROM questions old
                              WHERE old.id = checklist_items.question_id)
            ORDER BY cur.version DESC
            LIMIT 1
        ), question_id)
        WHERE question_id IN (SELECT id FROM questions WHERE NOT is_current)
    """)


def downgrade() -> None:
    # The old pointers were the bug; there is nothing worth restoring.
    pass
