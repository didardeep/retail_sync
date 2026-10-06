import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from dotenv import load_dotenv
from sqlalchemy import MetaData, create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=BACKEND_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///retail_sync.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)

# Named constraints let Alembic drop or alter them later on every database
# (SQLite and Postgres both), instead of failing on "constraint None".
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
Base = declarative_base(metadata=MetaData(naming_convention=NAMING_CONVENTION))


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return cfg


def init_db():
    """Bring the database to the latest schema (alembic upgrade head).

    Schema changes are made by adding a migration (see docs/DB_Migrations.md),
    never by editing tables by hand or calling create_all.
    """
    tables = set(inspect(engine).get_table_names())
    if tables and "alembic_version" not in tables:
        raise RuntimeError(
            "This database was created before migrations were introduced. "
            "Either rebuild it with `python seed.py --reset`, or if it already "
            "matches the 0001 baseline, run `alembic stamp 0001` and start again."
        )
    command.upgrade(_alembic_config(), "head")


def reset_db():
    """Drop every table, including Alembic's version table, so the next
    init_db() rebuilds the whole schema from the migrations."""
    from . import models  # noqa: F401  (register mappers; models imports Base from here)
    Base.metadata.drop_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
