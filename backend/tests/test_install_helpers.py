"""The first-install helpers: the generated .env, creating the database, and the
admin argument format (scripts\\install.bat strings them together)."""
from pathlib import Path

import pytest
from sqlalchemy.engine import make_url

import create_database
import make_env
from create_admin import parse_args

EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"


def test_generated_env_has_a_fresh_secret_and_a_sqlite_database():
    first = make_env.render(EXAMPLE.read_text(encoding="utf-8"))
    second = make_env.render(EXAMPLE.read_text(encoding="utf-8"))
    secrets = [line.split("=", 1)[1] for t in (first, second) for line in t.splitlines()
               if line.startswith("JWT_SECRET=")]
    assert len(secrets) == 2 and secrets[0] != secrets[1]
    assert all(len(s) >= 48 and s != "change-me-in-production" for s in secrets)
    active = [line for line in first.splitlines() if line.startswith("DATABASE_URL=")]
    assert active == [f"DATABASE_URL={make_env.SQLITE_URL}"]
    assert "# DATABASE_URL=postgresql" in first  # the PostgreSQL example is kept as a comment


def test_make_env_never_overwrites_an_existing_env(tmp_path, monkeypatch, capsys):
    (tmp_path / ".env.example").write_text(EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(make_env, "HERE", tmp_path)
    assert make_env.main() == 0
    created = (tmp_path / ".env").read_text(encoding="utf-8")
    assert "JWT_SECRET=" in created
    assert make_env.main() == 0  # second run
    assert (tmp_path / ".env").read_text(encoding="utf-8") == created
    assert "already exists" in capsys.readouterr().out


def test_sqlite_needs_no_database_to_be_created():
    assert "nothing to create" in create_database.ensure_database("sqlite:///x.db")


def test_the_new_postgres_database_is_made_from_the_servers_own_database():
    url = make_url("postgresql+psycopg2://app:pw@db.local:5432/retail_sync")
    assert create_database.maintenance_url(url).database == "postgres"
    assert create_database.maintenance_url(url).host == "db.local"


def test_an_unsafe_database_name_is_refused_before_anything_is_run():
    with pytest.raises(ValueError):
        create_database.ensure_database('postgresql+psycopg2://u:p@localhost/x"; drop database y; --')


def test_a_failed_check_only_warns_so_the_install_can_carry_on(monkeypatch, capsys):
    def boom(*_):
        raise RuntimeError("no route to host")
    monkeypatch.setattr(create_database, "ensure_database", boom)
    assert create_database.main() == 0
    assert "WARNING" in capsys.readouterr().out


def test_admin_arguments_take_an_optional_email_after_each_login():
    assert parse_args(["alice"]) == [("alice", "")]
    assert parse_args(["alice", "alice@kpmg.com"]) == [("alice", "alice@kpmg.com")]
    assert parse_args(["alice", "alice@kpmg.com", "bob", "carol", "carol@kpmg.com"]) == [
        ("alice", "alice@kpmg.com"), ("bob", ""), ("carol", "carol@kpmg.com")]
    assert parse_args([]) == []
