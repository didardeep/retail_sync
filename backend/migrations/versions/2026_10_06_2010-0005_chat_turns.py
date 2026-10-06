"""chat turns

Logs each AI assistant exchange (question, reply, tools used, latency) for analytics.
The model was added without a migration, so databases built from migrations
had no table for the assistant to write to.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-06 20:10:23.996373

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('chat_turns',
    sa.Column('id', sa.String(length=12), nullable=False),
    sa.Column('conversation_id', sa.String(length=12), nullable=False),
    sa.Column('turn_index', sa.Integer(), nullable=True),
    sa.Column('user_id', sa.String(length=12), nullable=True),
    sa.Column('question', sa.Text(), nullable=True),
    sa.Column('reply', sa.Text(), nullable=True),
    sa.Column('tools_used', sa.JSON(), nullable=True),
    sa.Column('latency_ms', sa.Integer(), nullable=True),
    sa.Column('iterations', sa.Integer(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_chat_turns_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_chat_turns'))
    )
    with op.batch_alter_table('chat_turns', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_chat_turns_conversation_id'), ['conversation_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('chat_turns', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_chat_turns_conversation_id'))

    op.drop_table('chat_turns')