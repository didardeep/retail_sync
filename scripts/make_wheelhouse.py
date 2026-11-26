"""Build the offline package bundle for a server that cannot reach PyPI (dev machine only).

    python scripts/make_wheelhouse.py [--python 3.14] [--platform win_amd64] [--out DIR]

Downloads every package in backend/requirements.txt, plus everything those need,
as ready-built wheels for the SERVER's Python version and platform (not this
machine's), checks the set is complete, and writes one zip:

    RetailSync-wheels-py314-win_amd64.zip      (extract it into the app folder)

Copy that zip to the server next to the release zip, extract both into the same
folder (so wheels\\ sits beside backend\\ and scripts\\), and run install.bat. It
sees wheels\\ and installs from it with no internet at all.

The Python version must match the server's: check it there with `python --version`
and make sure it is 64-bit. Needs internet on this machine, once.
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIREMENTS = ROOT / "backend" / "requirements.txt"

README = """Offline Python packages for Retail Sync
=======================================
Built for Python {version} on {platform} (64-bit Windows). {count} files, {size_mb:.0f} MB.

How to use (the server has no internet):
1. Extract this zip INTO the app folder, so that the folder named "wheels" sits
   next to "backend" and "scripts".
2. Run scripts\\install.bat <login> [<email>] as usual. It finds wheels\\ and installs
   from it without touching the internet.

If install.bat says "No matching distribution found" or a wheel "is not a supported
wheel on this platform", this bundle does not match the server's Python. Check
`python --version` on the server (needs {version}) and that it is 64-bit, then build
a bundle for the right version on a machine with internet:
    scripts\\make-wheelhouse.bat <version>        e.g. scripts\\make-wheelhouse.bat 3.12
"""


def pip(*args, capture=False):
    return subprocess.run([sys.executable, "-m", "pip", *args], text=True,
                          capture_output=capture)


def target_flags(version, platform):
    return ["--only-binary=:all:", "--python-version", version, "--platform", platform,
            "--implementation", "cp", "--abi", "cp" + version.replace(".", "")]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--python", default="3.14", help="the SERVER's Python, e.g. 3.14 (default)")
    ap.add_argument("--platform", default="win_amd64", help="pip platform tag (default win_amd64)")
    ap.add_argument("--out", default=str(ROOT), help="where to write the zip (default: repo root)")
    args = ap.parse_args()
    flags = target_flags(args.python, args.platform)
    tag = f"py{args.python.replace('.', '')}-{args.platform}"

    work = Path(tempfile.mkdtemp(prefix="retailsync_wheels_"))
    wheels = work / "wheels"
    wheels.mkdir()
    try:
        print(f"Downloading packages for Python {args.python} / {args.platform} ...")
        res = pip("download", "-r", str(REQUIREMENTS), "-d", str(wheels), *flags)
        if res.returncode:
            print("\nDownload failed. A package without a ready-built wheel for this Python version"
                  "\nis the usual cause: see the first ERROR line above, then pin a release that has one"
                  "\nin backend/requirements.txt.")
            return 1

        # The proof: install from the folder alone, with no index, into a scratch directory.
        print("\nChecking the set is complete (an install that may only use this folder) ...")
        probe = work / "probe"
        res = pip("install", "--dry-run", "--no-index", "--find-links", str(wheels), "--target", str(probe),
                  "--ignore-installed", "-r", str(REQUIREMENTS), *flags, capture=True)
        if res.returncode:
            print(res.stdout[-1500:], res.stderr[-1500:])
            print("The bundle is NOT complete. Nothing written.")
            return 1

        files = sorted(wheels.iterdir())
        size_mb = sum(f.stat().st_size for f in files) / (1024 * 1024)
        (wheels / "README.txt").write_text(
            README.format(version=args.python, platform=args.platform, count=len(files), size_mb=size_mb),
            encoding="utf-8")

        out = Path(args.out) / f"RetailSync-wheels-{tag}.zip"
        with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as zf:  # wheels are already compressed
            for f in sorted(wheels.iterdir()):
                zf.write(f, f"wheels/{f.name}")
        print(f"\nWrote {out}\n  {len(files)} files, {size_mb:.0f} MB, complete for Python {args.python} on {args.platform}.")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
