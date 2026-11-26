"""questions carry a criticality (High / Medium / Low) that sets their scoring weight

Replaces the free 1-5 weight and the separate critical flag. Existing questions
get a criticality from what they had: critical or weight 5 is High, weight 3-4
is Medium, the rest Low; their weight is then set from the criticality so every
new score uses the new scale. Scores already saved on finished audits are kept.

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-23 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Keep in step with app.models.CRITICALITY_WEIGHT.
WEIGHTS = {"High": 3, "Medium": 2, "Low": 1}


def upgrade() -> None:
    with op.batch_alter_table('questions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('criticality', sa.String(length=10), nullable=True))

    questions = sa.table(
        'questions',
        sa.column('criticality', sa.String),
        sa.column('weight', sa.Integer),
        sa.column('is_critical', sa.Boolean),
    )
    weight = sa.func.coalesce(questions.c.weight, 1)
    op.execute(questions.update().values(criticality=sa.case(
        (questions.c.is_critical.is_(True), 'High'),
        (weight >= 5, 'High'),
        (weight >= 3, 'Medium'),
        else_='Low',
    )))
    for level, w in WEIGHTS.items():
        op.execute(questions.update().where(questions.c.criticality == level)
                   .values(weight=w, is_critical=(level == 'High')))


def downgrade() -> None:
    with op.batch_alter_table('questions', schema=None) as batch_op:
        batch_op.drop_column('criticality')
