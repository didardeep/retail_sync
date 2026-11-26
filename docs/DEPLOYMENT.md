# Deployment (bare-metal Windows, internal server)

No Docker, no nginx/IIS. The backend serves the built website directly, so the
whole app is a single `uvicorn` process on a single port (**8199**) that you
start and stop by hand from one shell.

Written from the deployment kit in `E:\KPMG\KPMG_Server_req` and adapted to this
app. Companion: `docs/PATCH_AND_PROD_RUNBOOK.md` (building and applying
updates). What is deliberately not done yet: `docs/TODOS-for-Production.md`.

---

## 1. How it works

- `npm run build` compiles `frontend/src/` into static files in `frontend/dist/`.
- `backend/app/spa.py` mounts `/assets` from that folder and adds one catch-all
  route (registered last, after every API route). It serves a real file when one
  exists (`sw.js`, icons, manifest) and `index.html` for everything else, so a
  refresh on a client route such as `/audits/12` still works. An unknown
  `/api/...` path is a JSON 404, never the web page.
- The catch-all is public (the browser needs the login page before it has a
  token). Every `/api/...` route except `/api/auth/login` and `/api/health`
  needs a token; `backend/tests/test_route_auth.py` checks this for every route.
- If `frontend/dist/index.html` does not exist, none of this registers, so
  local development (`npm run dev` with the Vite proxy) is unaffected.
- The site is built without `VITE_API_BASE`, so the browser calls `/api` on the
  address it was opened from. Same origin, so no CORS is needed.
- `scripts/start-server.bat` sets `APP_ENV=production`. In that mode the server
  closes `/docs`, `/redoc` and
  `/openapi.json`, and allows no cross-origin callers unless `CORS_ORIGINS` lists
  them. A missing or short `JWT_SECRET` only logs a warning for now (P2). Development (`python run.py`) keeps the easy defaults.

## 2. Prerequisites on the server

- **Python 3.11 or newer** (the office server runs 3.14). `setup.bat` checks.
  The venv keeps the interpreter it was made with; recreate `backend\venv` if the
  server's Python is upgraded.
- **A database: nothing to install to get started.** The release zip's `backend\.env`
  uses SQLite (a file in `backend\`), which `install.bat` creates by itself. For
  PostgreSQL instead, have a server and a user (it may create the database if
  that user has the CREATEDB right; otherwise create an empty one, suggested name
  `retail_sync`) and see section 4.
- **No Node on the server.** The release zip already contains the built site.
  Node 18+ is only needed on the machine that builds it.
- A free **TCP port**: 8199. To change it, set `PORT` before `start-server.bat`,
  and open that port in the firewall instead.

## 3. First install (one command)

On the dev machine: `scripts\make-release.bat` -> `RetailSync-full-<commit>.zip`.
It contains the app, the built website, `INSTALL.txt` and a ready-to-use
`backend\.env` (generated for that zip: a fresh random `JWT_SECRET` and the SQLite
database; it is never your own dev `.env`). **Keep the zip private** because of
that file.

On the server:

1. **Extract** the zip to any folder (the scripts find their own location).
2. Open a command prompt in that folder and run **one command**:

   ```
   scripts\install.bat alice alice@kpmg.com
   ```

   (`<login> [<email>]`; the email is optional and more than one admin can be
   listed.) It does, in order, and stops at the first failure with the likely
   causes:
   1. `setup.bat`: creates `backend\venv`, installs `backend\requirements.txt`,
      checks the packages import, and uses the shipped website (no Node needed);
   2. `make_env.py`: uses the `backend\.env` from the zip (or creates one if it is
      missing). It never overwrites an existing `.env`;
   3. `db-migrate.bat`: creates the database if it is missing (PostgreSQL only;
      SQLite makes its file) and then every table;
   4. `create-admin.bat`: creates the first admin and prints a temporary password
      ONCE. Write it down. Never run `seed.py` on a server (demo users, shared
      password `pass`).
3. **Firewall:** add an inbound rule for TCP 8199, scoped to the intranet subnet.
4. `scripts\start-server.bat` and leave the window open (Ctrl+C stops it).
5. **Verify from another machine:** `http://<server>:8199` shows the login page;
   a refresh on a deep link (for example `/audits`) still loads; `/api/health`
   returns 200; `/docs` is closed; a protected URL with no token returns 401.

`install.bat` is safe to run again: it keeps an existing `.env`, tables and admins.

To use **PostgreSQL** instead of SQLite: edit `DATABASE_URL` in `backend\.env`
(the example line is there as a comment), then run `scripts\db-migrate.bat`. Back
up the SQLite file (`backend\retail_sync.db`) together with `backend\uploads`.

### A server with no internet (offline Python packages)

`install.bat` normally downloads the Python packages from PyPI (61 files, about
19 MB in all). If the server cannot reach PyPI, ship them as files instead. They
go in a second, separate zip, because they depend on the server's Python version.

**On a machine WITH internet (the dev machine):**

1. Find out the server's Python. On the server run `python --version` (the kit
   says 3.14) and check it is 64-bit: `python -c "import struct; print(struct.calcsize('P')*8)"`
   should print `64`. The bundle must match both.
2. Run `scripts\make-wheelhouse.bat 3.14` (use the server's version). It downloads
   every package as a ready-built wheel for that Python and Windows 64-bit, checks
   that the set is complete by installing from the folder alone, and writes
   `RetailSync-wheels-py314-win_amd64.zip` (about 19 MB).
3. Copy TWO files to the server (USB stick, file share, whatever is allowed):
   `RetailSync-full-<commit>.zip` and `RetailSync-wheels-py314-win_amd64.zip`.

**On the server:**

4. Extract the release zip to the app folder. Then extract the wheels zip into the
   SAME folder, so that a folder named `wheels` sits next to `backend` and `scripts`.
5. Run `scripts\install.bat alice alice@kpmg.com` exactly as in section 3. It finds
   `wheels\`, prints "Offline packages found", and installs from it with `pip
   --no-index`, so it never tries the internet.

Good to know:

- Run `install.bat` only AFTER the wheels zip is extracted. With neither the bundle nor
  internet, it stops after about 20 seconds and says what is missing (it used to
  hang on the first package, `fastapi`, retrying pypi.org). Check the files are in
  place with `dir wheels\*.whl` (61 files). Windows Explorer's "Extract All" adds a
  folder named after the zip; the installer also looks one folder down, so that
  layout works too.
- A bundle fits ONE Python version and platform. "No matching distribution found"
  or "not a supported wheel" means the versions differ: build a new bundle for the
  server's version (`make-wheelhouse.bat 3.12`, for example).
- When an update changes `backend\requirements.txt`, build a new bundle, delete the
  old `wheels\` folder, extract the new one, and then run `update.bat` or `setup.bat`.
  (`update.bat` also installs from `wheels\` when it exists.)
- `wheels\` is deliberately not in the release zip and not in git.
- If the server has a proxy or an internal PyPI mirror, that is simpler: set
  `HTTPS_PROXY=http://host:port` (or `PIP_INDEX_URL=https://mirror/simple`) before
  `install.bat` and no bundle is needed.
- Node is not involved: the website is already built into the release zip.

## 4. Settings (`backend\.env`)

| Variable | Needed | Meaning |
|---|---|---|
| `DATABASE_URL` | yes (the zip's `.env` has it) | `sqlite:///retail_sync.db` (the default in the release zip) or `postgresql+psycopg2://user:password@host:5432/retail_sync` (URL-encode special characters in the password) |
| `JWT_SECRET` | set it on the server | A long random string (32+ characters recommended). Not enforced: the server starts with any value and logs a warning if it is missing or short, but a guessable secret lets anyone forge a login. `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Changing it logs everyone out |
| `CORS_ORIGINS` | no | Comma list of other origins allowed to call the API, e.g. the Android app (`https://localhost`). Empty = none in production |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` `SMTP_TLS` | no | Alert emails. With `SMTP_HOST` empty, alerts stay in the app's bell only |
| `ALERT_INTERVAL_SECONDS` | no | How often alerts are checked (default 3600) |
| `GOOGLE_API_KEY` `LLM_MODEL` | no | Enables the AI assistant, which sends questions and data to Google. Leave empty to keep it off |
| `PG_BIN` | no | Postgres `bin` folder, if `pg_dump` is not on PATH (for `db-dump.bat`) |
| `FRONTEND_DIST` `LOG_DIR` `APP_ENV` | no | Overrides for where the site and logs live, and the mode. Defaults are right |

`backend\.env` is never committed or shipped. Keep a copy of it somewhere safe
(it holds the `JWT_SECRET` and the database password).

## 5. Helper scripts (`scripts\`)

Batch files wrapping the steps above. They resolve paths from their own location
and expect the venv at `backend\venv`.

| Script | What it does |
|---|---|
| `install.bat <login> [<email>]` | The first install in one command: setup, `.env`, database and tables, first admin (see section 3) |
| `setup.bat` | One-time: checks system Python, creates the venv, installs packages (pip log: `backend\logs\pip-install.log`), verifies they import, then builds the site (or uses the shipped `dist` if there is no node) |
| `_lib.bat` | Shared helpers (venv check, keep-window-open on failure). Do not run directly |
| `build-frontend.bat` | `npm ci` + `npm run build` (needs Node). Never run it while a dev server is using `node_modules`: `npm ci` deletes the folder |
| `start-server.bat` | Production mode, uvicorn on 8199, no `--reload` |
| `db-migrate.bat` | Creates the database if it is missing (PostgreSQL), then every table; safe to re-run. The server also brings the schema up to date when it starts |
| `db-dump.bat` / `db-restore.bat <file>` | Dump / restore the `.env` database (see section 7) |
| `create-admin.bat <login> [<email>] ...` | Create admin accounts in the `.env` database |
| `view-logs.bat` | Live-tail `backend\logs\app.log` |
| `update.bat [branch]` | `git pull`, refresh pip packages, rebuild the site (if node exists) |
| `make-patch.bat <commit>` | Dev machine only: patch zip since a commit (see the runbook) |
| `make-release.bat` | Dev machine only: full zip for a first install |
| `make-wheelhouse.bat [python-version]` | Dev machine only (needs internet): builds `RetailSync-wheels-py<ver>-win_amd64.zip`, every Python package as a file, for a server with no internet (see section 3). Default version 3.14 |

## 6. Logging

`backend/app/request_log.py` writes one line per state-changing request (POST,
PUT, PATCH, DELETE) and per failed request (4xx/5xx) to `backend\logs\app.log`
(rotating, 5 MB x 5) and the console: status, method, path, who (name, id,
role from the token), duration, and for failures the error text. Request bodies
and query strings are never logged, because they carry passwords. This is
separate from the `audit_log` database table, which records business actions
and, since the Android work, logins and failed logins.

## 7. Moving data between databases

`scripts\db-dump.bat` and `scripts\db-restore.bat <file>` wrap
`backend\db_transfer.py`:

```
python db_transfer.py dump                 -> backups\<db>_<timestamp>.dump
python db_transfer.py restore <file.dump>  -> REPLACES the target's tables
```

They need `pg_dump` / `pg_restore` on PATH, or `PG_BIN` set in `.env`. Dumps
include password hashes; keep them private and delete them from the server after
restoring. Photo evidence and annexures are files in `backend\uploads`, not in
the database: copy that folder too when moving data.

## 8. Admin accounts

The login page takes a username; it is stored lowercase in the `email` column of
`users`. `create-admin.bat alice alice@example.com` creates an ADMIN with a
random temporary password, printed once. The second value is where the app sends
that person's alert mail. An existing login is left alone. Admins can create
every other user and reset passwords in User Management.

There is no forced password change at first login and no self-service password
change yet; see `docs/TODOS-for-Production.md`.

## 9. Updating an existing server

- Server can reach git: `scripts\update.bat`, then restart the server.
- Otherwise: on the dev machine `scripts\make-patch.bat <commit-the-server-is-on>`
  builds `RetailSync-patch-<base>-to-<head>.zip` with the changed files, the
  PREBUILT `frontend\dist`, `PATCH_MANIFEST.txt`, `APPLY.txt` and, if files were
  removed, `DELETE_FILES.bat`. Follow `APPLY.txt` (full detail in the runbook).
- Pitfalls: the base commit must be the one the server really runs; a patch with
  a schema change needs the migration step (the server also runs it at start);
  never run `seed.py` on a server.

## 10. Restarting after a change

- Backend code changed: Ctrl+C, then `scripts\start-server.bat`.
- Site changed: apply a patch with the new `dist` (or rebuild where node exists),
  then restart. The files are read from disk and are not rebuilt automatically.

## 11. Local development (dev machine)

Not for the server. Separate terminals.

1. Backend, one-time: `cd backend`, `python -m venv .venv`, activate it,
   `pip install -r requirements-dev.txt` (runtime packages plus the tests).
2. Seed demo data if you want it: `python seed.py --reset`
   (**dev only**, logins `manager`, `amit`, `sharma`, password `pass`).
3. Backend with auto-reload: `python run.py` (port 5050; docs at `/docs`).
4. Frontend: `cd frontend`, `npm install`, `npm run dev` (port 5173, proxies
   `/api` to 5050).
5. Tests: `cd backend`, `python -m pytest -q`; frontend: `npm test`.
6. Stop a server with Ctrl+C. If a port is stuck, find the PID with
   `netstat -ano | findstr :8199` and end only that process.
7. Do not use the global `start-servers` / `stop-servers` skills for this
   project; they target a different app.

## 12. The Android app and the server

The phone app (`docs/ANDROID_APP.md`) talks to this same server. It is for
auditors only: it sends `X-App-Client: auditor-app` and the server refuses every
other role from it (`backend/app/auth.py`); the website is unaffected. Its build bakes
in the server address (`VITE_API_BASE`), and the website build must NOT have one.
Two things are needed on the server side for the phone app: its origin in
`CORS_ORIGINS`, and HTTPS if the demo-only settings (`server.cleartext`,
`allowMixedContent`) are to be removed. Plain `http://` on the intranet works
only with those settings left on; see `docs/TODOS-for-Production.md` (P9).

## 13. Writing or changing a `.bat` helper

Conventions for everything in `scripts\`:

- Start with `@echo off` and a `REM` line saying what it does and when to run it.
- `setlocal`, then resolve paths from the script's own location (`%~dp0..`).
- Never rely on PATH or `activate`. `call "%~dp0_lib.bat" require_venv` sets
  `%PY%` to `backend\venv\Scripts\python.exe` (and fails with a clear message if
  missing); run `"%PY%" -m pip ...`, `"%PY%" -m uvicorn ...`.
- Check every step with `if errorlevel 1 goto :somefail`. Each failure label
  prints what failed and the likely causes, then goes to `:fail`, which calls
  `_lib.bat pause_if_dblclick` and `exit /b 1`.
- Print the Python/Node version before long steps.
- Set `NOPAUSE=1` when running from automation so a failure never waits for a key.
- Save with CRLF line endings (`.gitattributes` enforces it for `*.bat`).
- Plain ASCII only (no arrows, em-dashes, box characters).
- Add the script to the table in section 5.

---

## 14. What has been verified

Rehearsed on 2026-11-13 on the dev PC (Windows, **Python 3.11.15**) against a
scratch copy, so nothing in the working folder was touched.

**Verified (ran it, saw it work)**

- `make-release.bat` built the full zip (about 1 MB, 280 files). Checked it
  holds the built site and `.env.example`, and holds no `.env`, database,
  `venv`, `node_modules`, logs or Android project.
- Unpacked it into a new folder and ran `setup.bat` with Node removed from PATH:
  venv created, packages installed, "Imports OK", and "npm not found - using the
  shipped frontend\dist".
- `db-migrate.bat` ran all 14 migrations on an empty database.
  `create-admin.bat` made an admin with a temporary password.
- `start-server.bat` ran on **port 8199** in production mode. Over HTTP: login
  page 200, deep link `/audits` 200 (page), `sw.js` and manifest served with
  `no-cache`, JS asset 200, `/api/health` 200 (GET and HEAD), protected URL with
  no token 401, unknown `/api/...` path a JSON 404, `/docs` and `/openapi.json`
  not served, bad login 401, admin login 200, a foreign `Origin` gets no CORS
  header, `../` and encoded `%2e%2e/` paths cannot read `backend\.env`.
- In Chrome, served from 8199: the login page loads, admin login works and lands
  on the dashboard with the full sidebar, a refresh on a deep link loads the
  app, and the console shows no errors.
- `backend\logs\app.log` records writes and failures with who and when; the
  password typed in a bad login is not in it.
- In the new venv (the pinned versions from `requirements.txt`): `pip check`
  reports no broken requirements and the backend test suite passes (137 tests).
- `make-patch.bat` built a patch zip with the right file list, manifest and
  `APPLY.txt`.

**Not verified (do these on the server)**

- **Python 3.14.** Only checked that wheels exist (`pip install --dry-run
  --platform win_amd64 --python-version 3.14`, which resolved after the
  `psycopg2-binary` and `pydantic` bumps). The app and tests were NOT run on
  3.14. `fastapi 0.115.0`, `uvicorn 0.30.6` and the `starlette` they pull in are
  older than 3.14, so run `setup.bat` and the test suite (`requirements-dev.txt`,
  `python -m pytest -q`) on the server's Python before relying on it. If
  something fails, `docs/decisions-site-deployment.md` D9 says what was changed
  and why.
- **PostgreSQL.** There is no Postgres on this PC. Migrations were run on SQLite
  only, and `db_transfer.py` (`pg_dump` / `pg_restore`) was never run. The
  migrations are the ones the team already used on Postgres, but run
  `db-migrate.bat` on the real database and read its output.
- The Windows Firewall rule and reaching the site from another machine.
- Alert email (SMTP), and the AI assistant (left off).
- `update.bat` (the git path), applying a patch on a server, and
  `DELETE_FILES.bat`.
- HTTPS (not set up: P21), and the Android app against this server.
