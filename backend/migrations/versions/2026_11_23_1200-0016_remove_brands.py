"""remove brands: drop stores.brand_id and the brands table

Stores no longer belong to a brand. The downgrade recreates the table with a
single 'Unassigned' brand and puts every store under it; the original brand
names and onboarding details are not recoverable.

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-23 12:00:00

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0016'
down_revision: Union[str, None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_stores_brand_id_brands'), type_='foreignkey')
        batch_op.drop_column('brand_id')
    op.drop_table('brands')


def downgrade() -> None:
    op.create_table('brands',
    sa.Column('id', sa.String(length=12), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=True),
    sa.Column('legal_name', sa.String(length=200), nullable=True),
    sa.Column('category', sa.String(length=80), nullable=True),
    sa.Column('contact_name', sa.String(length=120), nullable=True),
    sa.Column('contact_email', sa.String(length=200), nullable=True),
    sa.Column('contact_phone', sa.String(length=40), nullable=True),
    sa.Column('regions', sa.JSON(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_brands')),
    sa.UniqueConstraint('name', name=op.f('uq_brands_name'))
    )
    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.add_column(sa.Column('brand_id', sa.String(length=12), nullable=True))
        batch_op.create_foreign_key(batch_op.f('fk_stores_brand_id_brands'), 'brands', ['brand_id'], ['id'])

    brand_id = uuid.uuid4().hex[:12]
    op.execute(sa.text("INSERT INTO brands (id, name, status, created_at) "
                       "VALUES (:id, 'Unassigned', 'Active', CURRENT_TIMESTAMP)").bindparams(id=brand_id))
    op.execute(sa.text("UPDATE stores SET brand_id = :id").bindparams(id=brand_id))

    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.alter_column('brand_id', existing_type=sa.String(length=12), nullable=False)
