import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, scoped_session, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///retail_sync.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    future=True,
)
SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, future=True))
Base = declarative_base()


def init_db():
    from . import models  # noqa: F401  (register mappers)
    Base.metadata.create_all(bind=engine)
