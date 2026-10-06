# Database Migrations (Alembic)

The schema is now changed through migrations, not by editing tables or re-running
`create_all`. A migration is a small Python file in `backend/migrations/versions/`
that says how to move the database from one version to the next (and back).

Why: with `create_all`, adding a column to an existing database did nothing, so every
schema change meant wiping the database. Migrations add the column and keep the data.

## Which database

- Default: SQLite file `backend/retail_sync.db` (used when there is no `backend/.env`).
- Postgres: set `DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/retail_sync`
  in `backend/.env` (see `.env.example`).
- Migrations and the app read the same `DATABASE_URL` (`app/db.py`).
- Tested so far on SQLite only. Run the migrations against a scratch Postgres before
  relying on them there.

## Everyday commands (run in `backend/`)

| Task | Command |
|------|---------|
| Bring your database up to date | `alembic upgrade head` (the app also does this on start) |
| See where your database is | `alembic current` |
| See history | `alembic history` |
| Undo the last migration | `alembic downgrade -1` |
| Wipe and rebuild with demo data | `python seed.py --reset` |

## Changing the schema

1. Edit the model in `app/models.py` (add a column, a table, an index).
2. Generate a migration from the difference:
   `alembic revision --autogenerate -m "short description"`
3. **Read the generated file.** Autogenerate is a draft: check the column types, that
   constraints have names, and that nothing unrelated slipped in.
4. Apply it: `alembic upgrade head`, then `alembic check` (it should say
   "No new upgrade operations detected").
5. Commit the model change and the migration file together.

Rules:
- Never edit a migration that has been merged; add a new one.
- Constraints get names automatically (naming convention in `app/db.py`). This is what
  lets later migrations drop or change them, including on SQLite.
- Adding a NOT NULL column to a table that has rows needs a default
  (`server_default=...`) in the migration.

## Two people adding migrations at once

Each migration points at the one before it. If two people both create a migration from
the same starting point, there are two "heads" and `alembic upgrade head` will complain.

- Before creating a migration: pull, run `alembic upgrade head`, then create yours.
- If it happens anyway: `alembic heads` shows both; `alembic merge -m "merge" <rev1> <rev2>`
  creates a merge migration. Commit it.
- Tell each other in chat before touching the same table.

## Existing databases created before migrations

Starting the app on such a database stops with a clear message. Choose one:
- Rebuild: `python seed.py --reset` (loses local data).
- Keep the data: `alembic stamp 0001` then `alembic upgrade head`. Only valid if the
  database already has the SOP tables (it was created after the SOP work). A database
  from before the SOP tables should be rebuilt.

Migration 0004 handles the unnamed unique constraint on `sop_templates.code` that
such a database carries, so `alembic check` is clean after upgrading it.

## Current migrations

| Revision | What |
|----------|------|
| 0001 | Baseline: the whole schema as of the SOP audit feature (22 tables) |
| 0002 | `issues.sop_audit_id` and `issues.sop_criterion_id` (foreign keys to `sop_audits` and `sop_criteria`) so issues can come from SOP audits |
| 0003 | `sop_audits.scheduled_at`, `notes`, `created_by_id`: a manager can schedule an SOP audit (status Planned) before the auditor starts it |
| 0004 | Versioned audit tools: `sop_templates.version`, `is_current`, `published_at`, `created_by_id`, `change_note`; unique (code, version) replaces unique (code); `stable_key` on `sop_sections` and `sop_criteria` (backfilled with the row id). Downgrade refuses while any tool has more than one version |

Planned: 0005 (review step: `sop_audit_reviews`, `sop_audits.reviewed_at/reviewed_by_id`). Only the
migration owner for a stream creates a migration; see `SOP_Audit_Roadmap.md`.

## Running the tests

`cd backend && python -m pytest` uses a throwaway SQLite database built by the real
migrations, so it never touches `retail_sync.db`.
