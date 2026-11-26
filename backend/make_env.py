"""Create backend/.env for a server, if there is none yet. Never overwrites one.

    python make_env.py

It starts from .env.example, with a fresh random JWT_SECRET and a SQLite
database (a file in backend/), so the app runs with no database server at all.
To use PostgreSQL instead, edit DATABASE_URL in .env (the example line is kept
there as a comment) and run scripts\\db-migrate.bat: it creates the database if
the user in the URL is allowed to.

Standard library only, so the release builder can import it too.
"""
import re
import secrets
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SQLITE_URL = "sqlite:///retail_sync.db"


def render(example_text):
    """The text of a ready-to-use server .env, built from .env.example."""
    text = example_text.replace("\r\n", "\n")
    text = re.sub(r"^JWT_SECRET=.*$", lambda _: f"JWT_SECRET={secrets.token_urlsafe(48)}", text, flags=re.M)
    text = re.sub(
        r"^DATABASE_URL=(postgresql.*)$",
        lambda m: "# PostgreSQL: to use it, comment out the SQLite line below and fill this one in.\n"
                  f"# DATABASE_URL={m.group(1)}\n"
                  "# SQLite (a file in the backend folder): works with no database server.\n"
                  f"DATABASE_URL={SQLITE_URL}",
        text, flags=re.M)
    return text


def main():
    target = HERE / ".env"
    if target.exists():
        print("backend\\.env already exists: left unchanged.")
        return 0
    example = HERE / ".env.example"
    if not example.is_file():
        print("backend\\.env.example is missing, so there is nothing to build .env from.")
        return 1
    target.write_text(render(example.read_text(encoding="utf-8")), encoding="utf-8")
    print("Created backend\\.env (new random JWT_SECRET, SQLite database).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
