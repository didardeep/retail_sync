"""Dump or restore the PostgreSQL database named by DATABASE_URL in backend/.env.

    python db_transfer.py dump                   -> backups/<db>_<timestamp>.dump
    python db_transfer.py restore <file.dump>    -> REPLACES the target's tables

Needs pg_dump / pg_restore on PATH, or PG_BIN set in .env to the PostgreSQL bin
folder. Dumps include password hashes: keep them private and delete them from
the server after restoring. Only PostgreSQL is supported here.
"""
import datetime as dt
import os
import shutil
import subprocess
import sys
from pathlib import Path

from sqlalchemy.engine import make_url

from app.db import BACKEND_DIR, DATABASE_URL

BACKUP_DIR = BACKEND_DIR / "backups"


def _tool(name):
    """Full path to a PostgreSQL client tool, from PG_BIN or PATH."""
    pg_bin = os.getenv("PG_BIN")
    found = shutil.which(name, path=pg_bin) if pg_bin else None
    found = found or shutil.which(name)
    if not found:
        raise SystemExit(f"{name} not found. Put the PostgreSQL bin folder on PATH or set PG_BIN in backend/.env")
    return found


def _connection():
    url = make_url(DATABASE_URL)
    if not url.drivername.startswith("postgresql"):
        raise SystemExit("db_transfer only supports PostgreSQL (DATABASE_URL is " + url.drivername + ")")
    env = dict(os.environ)
    if url.password:
        env["PGPASSWORD"] = url.password  # keeps it off the command line
    args = ["-h", url.host or "localhost", "-p", str(url.port or 5432)]
    if url.username:
        args += ["-U", url.username]
    return url.database, args, env


def dump():
    database, conn, env = _connection()
    BACKUP_DIR.mkdir(exist_ok=True)
    out = BACKUP_DIR / f"{database}_{dt.datetime.now():%Y%m%d_%H%M%S}.dump"
    subprocess.run([_tool("pg_dump"), *conn, "-Fc", "-f", str(out), database], env=env, check=True)
    print(f"Wrote {out}")


def restore(path):
    database, conn, env = _connection()
    if not Path(path).is_file():
        raise SystemExit(f"file not found: {path}")
    subprocess.run([_tool("pg_restore"), *conn, "--clean", "--if-exists", "--no-owner",
                    "-d", database, str(path)], env=env, check=True)
    print(f"Restored {path} into {database}")


def main(argv):
    if argv[:1] == ["dump"] and len(argv) == 1:
        dump()
    elif argv[:1] == ["restore"] and len(argv) == 2:
        restore(argv[1])
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
