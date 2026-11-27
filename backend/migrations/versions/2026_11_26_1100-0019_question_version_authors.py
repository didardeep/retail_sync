"""question versions record who saved them and why

Adds questions.edited_by_id and questions.change_note. Past versions get their
author from the audit log (each edit_question entry names the new version's id)
or, for a first version, from whoever proposed the question.

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-26 11:00:00

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0019'
down_revision: Union[str, None] = '0018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('questions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('edited_by_id', sa.String(length=12), nullable=True))
        batch_op.add_column(sa.Column('change_note', sa.Text(), nullable=True))
        batch_op.create_foreign_key('fk_questions_edited_by_id_users', 'users',
                                    ['edited_by_id'], ['id'])

    # Edits: each edit_question log entry names the code and the version it saved.
    # (Its entity_id is empty: the old code logged before the new id existed.)
    # Read in Python so the JSON details parse the same on SQLite and Postgres.
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT user_id, details FROM audit_log WHERE action = 'edit_question' "
        "ORDER BY timestamp")).fetchall()
    authors = {}
    for user_id, details in rows:
        if isinstance(details, str):
            details = json.loads(details or "{}")
        details = details or {}
        if user_id and details.get("code") and details.get("version"):
            authors[(details["code"], int(details["version"]))] = user_id
    for (code, version), user_id in authors.items():
        bind.execute(sa.text(
            "UPDATE questions SET edited_by_id = :u "
            "WHERE code = :c AND version = :v AND edited_by_id IS NULL"),
            {"u": user_id, "c": code, "v": version})
    # First versions (and anything the log does not cover): whoever proposed it.
    op.execute("""
        UPDATE questions SET edited_by_id = proposed_by_id
        WHERE edited_by_id IS NULL AND version = 1
    """)


def downgrade() -> None:
    with op.batch_alter_table('questions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_questions_edited_by_id_users', type_='foreignkey')
        batch_op.drop_column('change_note')
        batch_op.drop_column('edited_by_id')
