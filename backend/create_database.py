"""Create the database named in DATABASE_URL (backend/.env) if it does not exist.

    python create_database.py

PostgreSQL: connects to the server's own "postgres" database with the same user
and creates the database if it is missing. The user needs the CREATEDB right; if
it does not have it, this only warns and you create the database by hand
(CREATE DATABASE <name>;). SQLite creates its file by itself, so nothing to do.
Safe to run again. Tables are made by db-migrate.bat (init_db), not here.
"""
import re
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.db import DATABASE_URL

SAFE_NAME = re.compile(r"^[A-Za-z0-9_]+$")


def maintenance_url(url):
    """The server's built-in 'postgres' database, used only to create ours."""
    return url.set(database="postgres")


def ensure_database(raw_url=DATABASE_URL):
    """Returns a one-line report. Raises on a bad name or a failed connection."""
    url = make_url(raw_url)
    if not url.drivername.startswith("postgresql"):
        return f"{url.drivername}: nothing to create (the file is made on first use)"
    name = url.database or ""
    if not SAFE_NAME.match(name):
        raise ValueError(f"database name {name!r} may only use letters, digits and underscores")
    engine = create_engine(maintenance_url(url), isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            found = conn.execute(text("select 1 from pg_database where datname = :n"), {"n": name}).scalar()
            if found:
                return f"database '{name}' already exists"
            conn.execute(text(f'CREATE DATABASE "{name}"'))
            return f"created database '{name}'"
    finally:
        engine.dispose()


def main():
    try:
        print(ensure_database())
    except Exception as err:  # keep going: the database may already exist
        print(f"WARNING: could not check or create the database: {err}")
        print("If it does not exist yet, create it by hand (CREATE DATABASE <name>;) and run this again.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
