"""brands, store.brand_id and auditee-store links

A store belongs to exactly one brand (banner / chain). Existing stores are put
under a brand named 'Unassigned' so brand_id can be NOT NULL; an audit manager
moves them to real brands afterwards. user_stores links auditees to stores
(many auditees per store).

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-23 11:00:00.000000

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('brands',
    sa.Column('id', sa.String(length=12), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_brands')),
    sa.UniqueConstraint('name', name=op.f('uq_brands_name'))
    )
    op.create_table('user_stores',
    sa.Column('id', sa.String(length=12), nullable=False),
    sa.Column('user_id', sa.String(length=12), nullable=False),
    sa.Column('store_id', sa.String(length=20), nullable=False),
    sa.ForeignKeyConstraint(['store_id'], ['stores.id'], name=op.f('fk_user_stores_store_id_stores')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_user_stores_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_user_stores')),
    sa.UniqueConstraint('user_id', 'store_id', name=op.f('uq_user_stores_user_id'))
    )
    with op.batch_alter_table('user_stores', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_user_stores_store_id'), ['store_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_user_stores_user_id'), ['user_id'], unique=False)

    # Add the column as nullable, fill it, then make it NOT NULL.
    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.add_column(sa.Column('brand_id', sa.String(length=12), nullable=True))
        batch_op.create_foreign_key(batch_op.f('fk_stores_brand_id_brands'), 'brands', ['brand_id'], ['id'])

    brand_id = uuid.uuid4().hex[:12]
    op.execute(sa.text("INSERT INTO brands (id, name, created_at) VALUES (:id, 'Unassigned', CURRENT_TIMESTAMP)")
               .bindparams(id=brand_id))
    op.execute(sa.text("UPDATE stores SET brand_id = :id").bindparams(id=brand_id))

    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.alter_column('brand_id', existing_type=sa.String(length=12), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('stores', schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_stores_brand_id_brands'), type_='foreignkey')
        batch_op.drop_column('brand_id')
    op.drop_table('user_stores')
    op.drop_table('brands')
