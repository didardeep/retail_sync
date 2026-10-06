"""sop template versions

Audit tools become versioned: editing a tool that has been used creates a new
row (same code, version + 1) so finished audits keep the marks and wording they
were scored with. Sections and criteria get a stable_key that stays the same
across versions, so a question can be followed through a re-publish.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-06 16:10:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Names the unique constraint on databases where it was created unnamed
# (databases built before migrations existed and then stamped), so it can be
# dropped by name. Databases built from the baseline already have this name.
_UQ_NAMING = {"uq": "uq_%(table_name)s_%(column_0_name)s"}


def _drop_unique_code_postgres(bind) -> None:
    """Drop whichever unique constraint covers exactly the column `code`."""
    inspector = sa.inspect(bind)
    for uq in inspector.get_unique_constraints('sop_templates'):
        if uq['column_names'] == ['code']:
            op.drop_constraint(uq['name'], 'sop_templates', type_='unique')
    for ix in inspector.get_indexes('sop_templates'):
        if ix['unique'] and ix['column_names'] == ['code']:
            op.drop_index(ix['name'], table_name='sop_templates')


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'

    # --- sop_templates: version columns, unique (code, version) ------------
    if is_sqlite:
        with op.batch_alter_table(
            'sop_templates', recreate='always', naming_convention=_UQ_NAMING,
        ) as batch_op:
            batch_op.add_column(sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
            batch_op.add_column(sa.Column('is_current', sa.Boolean(), nullable=False, server_default=sa.true()))
            batch_op.add_column(sa.Column('published_at', sa.DateTime(), nullable=True))
            batch_op.add_column(sa.Column('created_by_id', sa.String(length=12), nullable=True))
            batch_op.add_column(sa.Column('change_note', sa.Text(), nullable=True))
            batch_op.drop_constraint('uq_sop_templates_code', type_='unique')
            batch_op.create_unique_constraint('uq_sop_templates_code_version', ['code', 'version'])
            batch_op.create_index(batch_op.f('ix_sop_templates_code'), ['code'], unique=False)
            batch_op.create_foreign_key(
                batch_op.f('fk_sop_templates_created_by_id_users'), 'users', ['created_by_id'], ['id'])
    else:
        _drop_unique_code_postgres(bind)
        with op.batch_alter_table('sop_templates') as batch_op:
            batch_op.add_column(sa.Column('version', sa.Integer(), nullable=False, server_default='1'))
            batch_op.add_column(sa.Column('is_current', sa.Boolean(), nullable=False, server_default=sa.true()))
            batch_op.add_column(sa.Column('published_at', sa.DateTime(), nullable=True))
            batch_op.add_column(sa.Column('created_by_id', sa.String(length=12), nullable=True))
            batch_op.add_column(sa.Column('change_note', sa.Text(), nullable=True))
            batch_op.create_unique_constraint('uq_sop_templates_code_version', ['code', 'version'])
            batch_op.create_index(batch_op.f('ix_sop_templates_code'), ['code'], unique=False)
            batch_op.create_foreign_key(
                batch_op.f('fk_sop_templates_created_by_id_users'), 'users', ['created_by_id'], ['id'])

    # --- stable keys on sections and criteria ------------------------------
    for table in ('sop_sections', 'sop_criteria'):
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column('stable_key', sa.String(length=12), nullable=True))
        # Existing rows are version 1: their key is simply their own id.
        op.execute(f"UPDATE {table} SET stable_key = id")
        with op.batch_alter_table(table) as batch_op:
            batch_op.alter_column('stable_key', existing_type=sa.String(length=12), nullable=False)
            batch_op.create_index(batch_op.f(f'ix_{table}_stable_key'), ['stable_key'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    multi = bind.execute(sa.text(
        "SELECT code FROM sop_templates GROUP BY code HAVING COUNT(*) > 1"
    )).fetchall()
    if multi:
        raise RuntimeError(
            "Cannot downgrade: these audit tools have more than one version: "
            + ", ".join(row[0] for row in multi)
            + ". Versions cannot be merged back automatically."
        )

    for table in ('sop_criteria', 'sop_sections'):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_index(batch_op.f(f'ix_{table}_stable_key'))
            batch_op.drop_column('stable_key')

    with op.batch_alter_table('sop_templates', recreate='always') as batch_op:
        batch_op.drop_constraint(batch_op.f('fk_sop_templates_created_by_id_users'), type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_sop_templates_code'))
        batch_op.drop_constraint('uq_sop_templates_code_version', type_='unique')
        batch_op.drop_column('change_note')
        batch_op.drop_column('created_by_id')
        batch_op.drop_column('published_at')
        batch_op.drop_column('is_current')
        batch_op.drop_column('version')
        batch_op.create_unique_constraint('uq_sop_templates_code', ['code'])
