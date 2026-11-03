"""brand onboarding: code, legal name, category, contact, regions, status, notes;
a phone number on users; what is wrong with a queried answer

Auditors are linked to stores through the existing user_stores table (the
user's role says whether a link is an auditor or an auditee), so no new table.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-03 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0011'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('brands', schema=None) as batch_op:
        batch_op.add_column(sa.Column('code', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('legal_name', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('category', sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column('contact_name', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('contact_email', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('contact_phone', sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column('regions', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('status', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('phone', sa.String(length=40), nullable=True))
    with op.batch_alter_table('audit_responses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('review_category', sa.String(length=30), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('audit_responses', schema=None) as batch_op:
        batch_op.drop_column('review_category')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('phone')
    with op.batch_alter_table('brands', schema=None) as batch_op:
        for col in ('notes', 'status', 'regions', 'contact_phone', 'contact_email',
                    'contact_name', 'category', 'legal_name', 'code'):
            batch_op.drop_column(col)
