"""link each auditor to the stores they already audit

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-03 14:30:00

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """An auditor's past and planned audits show which stores they cover.
    Auditors are linked through user_stores, like auditees."""
    conn = op.get_bind()
    pairs = conn.execute(sa.text(
        "SELECT DISTINCT auditor_id, store_id FROM audits WHERE auditor_id IS NOT NULL"
    )).fetchall()
    have = {(r[0], r[1]) for r in conn.execute(sa.text("SELECT user_id, store_id FROM user_stores"))}
    for user_id, store_id in pairs:
        if (user_id, store_id) in have:
            continue
        conn.execute(
            sa.text("INSERT INTO user_stores (id, user_id, store_id) VALUES (:id, :u, :s)"),
            {"id": uuid.uuid4().hex[:12], "u": user_id, "s": store_id},
        )


def downgrade() -> None:
    # The links cannot be told apart from ones added by hand, so they are kept.
    pass
