"""Build a zip for the site server (dev machine only).

Patch (an update for a server that already runs the app):
    python scripts/make_patch.py <base-commit> [--out DIR] [--suffix TEXT] [--no-build] [--no-dist]
  Files changed since <base-commit> (committed, uncommitted and untracked but
  not ignored) plus the PREBUILT frontend/dist when anything under frontend/
  changed. dist/ is gitignored, so a plain git diff never contains the website;
  this script builds it and ships it, so the server needs no node/npm.

Full release (a first install):
    python scripts/make_patch.py --full [--out DIR] [--suffix TEXT] [--no-build]
  Every tracked file plus the built frontend/dist, INSTALL.txt, and a ready
  backend/.env (a fresh random JWT_SECRET and a SQLite database, generated here;
  never your own dev .env). Patches never contain .env, so an update cannot
  overwrite the server's settings.

Both: records files deleted since the base (DELETE_FILES.bat), writes
PATCH_MANIFEST.txt and APPLY.txt (or INSTALL.txt) into the zip, uses forward
slashes, and never ships .env, databases, logs, backups, venv, node_modules or
the Android project. The website is built WITHOUT VITE_API_BASE, so it calls
/api on whatever address it is served from.

Output: <repo root>/RetailSync-patch-<base>-to-<head>.zip  or  RetailSync-full-<head>.zip
"""
import argparse
import importlib.util
import os
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # backend/, frontend/, scripts/, docs/
PREFIX = "RetailSync"

# Never ship these, even if they show up as changed or untracked.
EXCLUDE_PARTS = {"__pycache__", "node_modules", ".pytest_cache", "venv", ".venv", ".vite",
                 "logs", "backups", ".claude"}
EXCLUDE_NAMES = {".env", "patch.zip"}
EXCLUDE_SUFFIXES = (".pyc", ".dump", ".zip", ".db")
EXCLUDE_PREFIXES = ("frontend/android/",)  # the phone app is not part of the server

MODELS_FILE = "backend/app/models.py"
MIGRATIONS_DIR = "backend/migrations/"


def git(*args):
    res = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True)
    return res.stdout


def excluded(rel):
    p = Path(rel)
    return (
        bool(EXCLUDE_PARTS & set(p.parts))
        or p.name in EXCLUDE_NAMES
        or rel.endswith(EXCLUDE_SUFFIXES)
        or rel.startswith(EXCLUDE_PREFIXES)
    )


def collect(base):
    """(changed, deleted) paths since `base`, relative to the repo root."""
    changed, deleted = set(), set()
    out = git("diff", "--name-status", "--no-renames", "--relative", base, "--", ".")
    for line in out.splitlines():
        status, _, path = line.partition("\t")
        (deleted if status.startswith("D") else changed).add(path)
    for path in git("ls-files", "--others", "--exclude-standard", "--", ".").splitlines():
        changed.add(path)
    changed = {p for p in changed if not excluded(p) and (ROOT / p).is_file()}
    deleted = {p for p in deleted if not excluded(p) and not (ROOT / p).exists()}
    return sorted(changed), sorted(deleted)


def collect_all():
    files = set(git("ls-files", "--", ".").splitlines())
    files |= set(git("ls-files", "--others", "--exclude-standard", "--", ".").splitlines())
    return sorted(p for p in files if not excluded(p) and (ROOT / p).is_file())


def build_frontend():
    frontend = ROOT / "frontend"
    # The site calls /api on its own address. A leftover address from an
    # Android build would point the website at the wrong server.
    env = {k: v for k, v in os.environ.items() if k != "VITE_API_BASE"}
    if not (frontend / "node_modules").is_dir():
        subprocess.run("npm ci", cwd=frontend, check=True, shell=True, env=env)
    subprocess.run("npm run build", cwd=frontend, check=True, shell=True, env=env)


def server_env_text():
    """A ready-to-use .env for a new server (backend/make_env.py does the work)."""
    spec = importlib.util.spec_from_file_location("make_env", ROOT / "backend" / "make_env.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.render((ROOT / "backend" / ".env.example").read_text(encoding="utf-8"))


def dist_files():
    dist = ROOT / "frontend" / "dist"
    return sorted(p.relative_to(ROOT).as_posix() for p in dist.rglob("*") if p.is_file())


def check_dist_is_for_the_site():
    """Stop a build that has a laptop or emulator address baked in."""
    for js in (ROOT / "frontend" / "dist" / "assets").glob("*.js"):
        text = js.read_text(encoding="utf-8", errors="ignore")
        for bad in ("10.0.2.2", "127.0.0.1:5050", "localhost:5050"):
            if bad in text:
                raise SystemExit(f"frontend/dist/{js.name} contains '{bad}': it was built for a "
                                 "different server. Delete frontend/dist and rebuild without VITE_API_BASE.")


def apply_text(base, head, flags, has_deleted):
    steps = ["Stop the running server (Ctrl+C in its window)."]
    if flags["dist"]:
        steps.append("Delete the old website build so stale files do not linger:\n"
                     "      rmdir /s /q frontend\\dist     (run inside the app folder)")
    steps.append("Unzip this patch OVER the app folder, overwriting everything.\n"
                 "   Explorer 'Extract All' into the app folder, or: tar -xf <patch.zip> -C <app folder>")
    if has_deleted:
        steps.append("Run DELETE_FILES.bat from the app folder (removes files deleted upstream).")
    if flags["pip"]:
        steps.append("Install the changed Python packages:\n"
                     "      backend\\venv\\Scripts\\python.exe -m pip install -r backend\\requirements.txt")
    if flags["schema"]:
        steps.append("The database schema changed. Take a dump first (scripts\\db-dump.bat), then:\n"
                     "      scripts\\db-migrate.bat\n"
                     "   (The server also does this when it starts; running it first shows any error on its own.)\n"
                     "   NEVER run seed.py on a server: it creates demo users that share the password 'pass'.")
    steps.append("Start the server: scripts\\start-server.bat")
    steps.append("Check: open the site and hard refresh (Ctrl+F5); /api/health returns 200;\n"
                 "   backend\\logs\\app.log has no 500s (scripts\\view-logs.bat).")
    body = "\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1))
    return (f"Patch {base} -> {head}\n\n{body}\n\n"
            "This patch is only complete if the server is at commit " + base + ".\n"
            "If it is on a different commit, regenerate with:\n"
            "    python scripts\\make_patch.py <the server's commit>\n")


def install_text(head):
    steps = [
        "Extract this zip to the folder the app will live in (any folder; the scripts find their own location).",
        "Install Python 3.11 or newer (the office server has 3.14) and tick 'Add to PATH'. That is all:\n"
        "   no Node (the website is already built) and no database server (see the notes below).",
        "NO INTERNET on the server? Also copy RetailSync-wheels-pyXYZ-win_amd64.zip (made on a machine with\n"
        "   internet by scripts\\make-wheelhouse.bat) and extract it into the SAME folder, so a folder named\n"
        "   wheels sits next to backend. install.bat then installs from it, offline.",
        "Open a command prompt in the extracted folder and run ONE command:\n"
        "      scripts\\install.bat <login> [<email>]        e.g. scripts\\install.bat alice alice@kpmg.com\n"
        "   It installs the Python packages, uses the included backend\\.env, creates the database and every\n"
        "   table, and creates the first admin (the temporary password is printed once: write it down).",
        "Open the firewall: inbound TCP 8199, limited to the intranet subnet.",
        "Run scripts\\start-server.bat and leave the window open (Ctrl+C stops it).",
        "From another machine open http://<server>:8199 , sign in, and check /api/health returns 200.",
    ]
    body = "\n".join(f"{i}. {s}" for i, s in enumerate(steps, 1))
    notes = (
        "Notes\n"
        "- backend\\.env is included: a fresh random JWT_SECRET and a SQLite database (a file in backend\\).\n"
        "  Keep this zip private. install.bat never overwrites an existing .env, tables or admins, so it is\n"
        "  safe to run again. Updates (patch zips) never contain .env.\n"
        "- To use PostgreSQL instead: edit DATABASE_URL in backend\\.env (the example line is there), then run\n"
        "  scripts\\db-migrate.bat. It creates the database if the user may, then every table.\n"
        "- Back up backend\\retail_sync.db (if SQLite) and backend\\uploads together.\n"
    )
    return f"Full release {head}\n\n{body}\n\n{notes}\nDetails: docs\\DEPLOYMENT.md\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("base", nargs="?", help="commit the server currently runs, e.g. b0f35f4 (not with --full)")
    ap.add_argument("--full", action="store_true", help="full release for a first install")
    ap.add_argument("--out", default=str(ROOT), help="output directory (default: repo root)")
    ap.add_argument("--suffix", default="", help="text appended to the zip name, e.g. r2")
    ap.add_argument("--no-build", action="store_true", help="do not run npm build; ship the existing dist/")
    ap.add_argument("--no-dist", action="store_true", help="do not ship frontend/dist (patch only)")
    args = ap.parse_args()
    if args.full == bool(args.base):
        ap.error("give a base commit for a patch, or --full for a first install (not both)")

    head = git("rev-parse", "--short", "HEAD").strip()
    dirty = bool(git("status", "--porcelain", "--", ".").strip())
    if args.full:
        base, (changed, deleted) = None, (collect_all(), [])
    else:
        base = git("rev-parse", "--short", args.base).strip()
        changed, deleted = collect(base)
        if not changed and not deleted:
            print(f"No changes since {base}")
            return 1

    frontend_changed = args.full or any(p.startswith("frontend/") for p in changed + deleted)
    ship_dist = frontend_changed and not args.no_dist
    dist = []
    if ship_dist:
        if not args.no_build:
            build_frontend()
        dist = dist_files()
        if "frontend/dist/index.html" not in dist:
            print("frontend/dist/index.html missing after build")
            return 1
        check_dist_is_for_the_site()

    flags = {
        "pip": "backend/requirements.txt" in changed,
        "schema": MODELS_FILE in changed or any(p.startswith(MIGRATIONS_DIR) for p in changed),
        "dist": ship_dist,
        "backend": any(p.startswith("backend/") for p in changed),
    }
    kind = "full" if args.full else "patch"
    label = (f"full-{head}" if args.full else f"patch-{base}-to-{head}") + ("-dirty" if dirty else "")
    if args.suffix:
        label += f"-{args.suffix}"
    manifest = [f"Kind: {kind}", f"Base commit: {base or '-'}", f"Head commit: {head}",
                f"Uncommitted changes included: {'yes' if dirty else 'no'}", "",
                f"pip install needed:        {'YES' if flags['pip'] or args.full else 'no'}",
                f"database schema update:    {'YES' if flags['schema'] or args.full else 'no'}",
                f"frontend (prebuilt dist):  {'shipped in zip' if ship_dist else 'no frontend change'}",
                f"server restart needed:     {'YES' if flags['backend'] or ship_dist else 'no'}", "",
                f"Changed/added files ({len(changed)}):"] + [f"  {p}" for p in changed]
    manifest += ["", f"Deleted files ({len(deleted)}):"] + [f"  {p}" for p in deleted]
    manifest += ["", f"Built frontend files shipped: {len(dist)}"]
    if args.full:
        manifest += ["Includes backend/.env (generated: fresh JWT_SECRET, SQLite database): keep the zip private"]
    delete_bat = "@echo off\r\nREM Run from the app folder.\r\n" + "".join(
        f'del /q "{p.replace("/", chr(92))}"\r\n' for p in deleted)

    out = Path(args.out) / f"{PREFIX}-{label}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel in sorted(set(changed) | set(dist)):
            zf.write(ROOT / rel, rel)
        zf.writestr("PATCH_MANIFEST.txt", "\n".join(manifest) + "\n")
        if args.full:
            zf.writestr("INSTALL.txt", install_text(head))
            zf.writestr("backend/.env", server_env_text())
        else:
            zf.writestr("APPLY.txt", apply_text(base, head, flags, bool(deleted)))
        if deleted:
            zf.writestr("DELETE_FILES.bat", delete_bat)
    (Path(args.out) / f"{PREFIX}-{label}.manifest.txt").write_text("\n".join(manifest) + "\n")
    print(f"Wrote {out}")
    print("\n".join(manifest[:10]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
