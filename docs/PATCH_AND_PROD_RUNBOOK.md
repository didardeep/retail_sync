# Patch making and running a simple production version -- runbook

Short, practical companion to `docs/DEPLOYMENT.md`. Covers (1) building a zip on
the dev machine for a server that cannot reach git, (2) applying it on the
server, and (3) a minimal production-style run of the app.

All commands are Windows (cmd / PowerShell). Paths are relative to the app
folder (the one that holds `backend\`, `frontend\` and `scripts\`).

---

## 1. Mental model

- The whole app is ONE process: `uvicorn app.main:app` on port **8199**. It
  serves the API under `/api/...` and the built React site from `frontend\dist`.
- The database is set by `DATABASE_URL` in `backend\.env`: SQLite (a file in
  `backend\`) in the release zip's `.env`, or PostgreSQL if you switch it. Tests
  use a throwaway SQLite database and never touch the real one.
- `frontend\dist` is gitignored, so a plain `git diff` never contains the site.
  Every zip ships a PREBUILT `dist`, because the server has no node/npm.
- The site is built WITHOUT `VITE_API_BASE`, so it calls `/api` on whatever
  address it is opened from. (An Android build sets that variable; the zip
  builder refuses a `dist` that has a laptop or emulator address in it.)
- Schema changes are Alembic migrations (`backend\migrations\versions`). They
  run automatically when the server starts, and `scripts\db-migrate.bat` runs
  them on their own.
- A patch is only complete if the server is at the commit it was built against.
  Wrong base commit = missing files = "the patch did not work".

---

## 2. First install: a full release zip

On the dev machine, from the repo root:

```
scripts\make-release.bat
```

This writes `RetailSync-full-<commit>[-dirty].zip` in the repo root: every
tracked file plus the built `frontend\dist`, `PATCH_MANIFEST.txt` and
`INSTALL.txt` (the exact steps), plus a ready `backend\.env` generated for that zip
(fresh random `JWT_SECRET`, SQLite database; never your own dev `.env`, so keep
the zip private). It never includes databases, logs, backups, `venv`,
`node_modules` or the Android project. Patch zips never include any `.env`.

Then on the server run ONE command, `scripts\install.bat <login> [<email>]`
(packages, settings, database, tables, first admin), and follow `INSTALL.txt`
(it matches `docs\DEPLOYMENT.md`).

---

## 3. Building a patch (dev machine)

### 3.1 Before you build

1. Find out which commit the server really runs. If unsure, ask whoever applied
   the last zip; the manifest of the last patch names its target commit. Do not
   guess.
2. Make sure the work you want shipped is in the working tree (committed or
   not; uncommitted and new files are included and the zip name gets `-dirty`).
3. Run the tests:
   ```
   cd backend
   python -m pytest -q
   ```

### 3.2 Build

```
scripts\make-patch.bat <server-commit>
```

(or `python scripts\make_patch.py <server-commit>`). Options:

| Option | Meaning |
|---|---|
| `--suffix r2` | Append text to the zip name so it does not overwrite an earlier patch |
| `--no-build` | Do not run `npm run build`; ship whatever `frontend\dist` already exists |
| `--no-dist` | Do not ship `dist` (only if the server will build the site itself) |
| `--out DIR` | Write the zip somewhere other than the repo root |

What it does: collects files changed since the base commit (committed,
uncommitted, untracked-but-not-ignored); records deleted files in
`DELETE_FILES.bat`; if anything under `frontend\` changed, builds and ships the
whole `frontend\dist`; writes `PATCH_MANIFEST.txt` and `APPLY.txt` into the zip
and a `.manifest.txt` beside it. Zip entries use forward slashes.

Output: `RetailSync-patch-<base>-to-<head>[-dirty][-suffix].zip` in the repo root.

### 3.3 Verify before you send it

1. Extract the zip into a fresh empty folder (not inside the repo).
2. Compare the file list with the manifest. Expect the backend files you
   changed, new migrations if the schema changed, and `frontend/dist/index.html`
   plus `frontend/dist/assets/*`.
3. Open `frontend/dist/index.html`; the `.js` and `.css` names it references
   must exist in `frontend/dist/assets/`.
4. Compile check: `python -I -m compileall <extracted>\backend`
5. `git status` should show no stray tracked changes from the build.

---

## 4. Applying a patch (server)

`APPLY.txt` inside each zip is the authority for that patch. The usual order:

1. Stop the running server (Ctrl+C in its window).
2. Take a copy of the app folder, and a database dump if the schema changes
   (`scripts\db-dump.bat`).
3. Delete the old site build, inside the app folder: `rmdir /s /q frontend\dist`
4. Unzip the patch OVER the app folder, overwriting everything (Explorer
   "Extract All", or `tar -xf <patch.zip> -C <app folder>`).
5. If `DELETE_FILES.bat` is in the zip, run it from the app folder.
6. If `APPLY.txt` lists changed Python packages:
   `backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt`
7. If `APPLY.txt` lists a database update: `scripts\db-migrate.bat`. NEVER run
   `seed.py` on a server: it creates demo users that all share the password
   `pass`.
8. Start: `scripts\start-server.bat`
9. Hard refresh the browser (Ctrl+F5) and check `/api/health` returns 200,
   login works, a deep link such as `/audits` does not 404, and
   `backend\logs\app.log` has no 500s (`scripts\view-logs.bat`).

If something goes wrong: stop the server, put back the copy of the app folder,
and restore the dump if the schema changed.

---

## 5. Running a simple production version

First install: `docs\DEPLOYMENT.md` section 3. To rehearse on the dev machine
without a server, use a scratch copy so nothing in your working folder changes:

1. `scripts\make-release.bat --out <scratch>`
2. Extract it into a new folder and run `scripts\install.bat <login> [<email>]`
   there (it uses the zip's `.env` and SQLite, so nothing needs editing).
3. `scripts\start-server.bat`
4. Open `http://127.0.0.1:8199`.

### Smoke test (about 5 minutes)

1. `http://<server>:8199` loads the login page.
2. Log in as the admin created above.
3. Open Store Management and Audit Management; each loads its data.
4. As an Audit Manager, schedule an audit for an auditor; as that auditor, open it,
   answer a question and submit; as the manager, approve it.
5. `/api/health` returns 200; a protected URL with no token returns 401;
   `/docs` is closed; `backend\logs\app.log` shows the requests and no 500s.

---

## 6. Day-to-day operations

| Task | Command |
|---|---|
| Tail logs | `scripts\view-logs.bat` (file: `backend\logs\app.log`, 5 MB x 5 rotating) |
| Restart after backend change | Ctrl+C, then `scripts\start-server.bat` |
| Restart after a site change | apply a patch that includes `dist` (or `scripts\build-frontend.bat` where node exists), then restart |
| Update from git (server can reach git) | `scripts\update.bat [branch]`, then restart |
| Update without git | build a patch (section 3), apply it (section 4) |
| Dump database | `scripts\db-dump.bat` (needs `pg_dump` on PATH or `PG_BIN` in `.env`) |
| Restore database | `scripts\db-restore.bat <file.dump>` (REPLACES the target's tables) |
| New admin account | `scripts\create-admin.bat <login> <email> ...` |

Dumps contain password hashes. Keep them private and delete them from the
server after restoring. Photo evidence and annexures live in `backend\uploads`:
back that folder up with the database.

---

## 7. Checklist: patch day

- [ ] Server commit confirmed (not guessed)
- [ ] Tests green on the dev machine
- [ ] Patch built with that base commit; manifest reviewed
- [ ] Zip extracted to a scratch folder; compileall passes; dist assets present
- [ ] App folder copied and DB dump taken on the server (if the schema changes)
- [ ] Server stopped; `frontend\dist` removed; zip extracted over the app folder
- [ ] `db-migrate.bat` run (if listed); `seed.py` NOT run
- [ ] Server started; `/api/health` = 200; hard refresh; log has no 500s
- [ ] Quick smoke test of the changed feature as the relevant role
