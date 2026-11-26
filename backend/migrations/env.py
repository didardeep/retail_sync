"""Alembic environment.

Uses the same DATABASE_URL and model metadata as the app (app/db.py), so a
migration always runs against the database the app would use. Batch mode is
on so ALTERs that SQLite cannot do natively (add constraint, drop column) are
done by Alembic copying the table.
"""
from logging.config import fileConfig

from alembic import context

from app import models  # noqa: F401  (register every model on Base.metadata)
from app.db import DATABASE_URL, Base, engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of connecting (alembic upgrade --sql)."""
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
