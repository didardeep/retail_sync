"""Serve the built website (frontend/dist) from the API process.

One process, one port: the API answers under /api, and everything else is the
React app. A page refresh on a client route such as /audits/12 has no file on
disk, so it gets index.html and react-router takes over.

Nothing is registered when frontend/dist/index.html does not exist, so local
development (npm run dev plus the Vite proxy) is unaffected.
"""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# index.html and the service worker must never be cached, or a new release
# would not reach phones and browsers that already have the old one.
NO_CACHE = {"Cache-Control": "no-cache"}
NO_CACHE_FILES = {"index.html", "sw.js", "manifest.webmanifest"}


def mount_frontend(app: FastAPI, dist: Path) -> bool:
    """Register the website routes on `app`. Call it AFTER every API router so
    the API wins. Returns False (and registers nothing) if there is no build."""
    index = dist / "index.html"
    if not index.is_file():
        return False

    root = dist.resolve()
    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def website(path: str):
        # An unknown API path is a JSON 404, never the web page.
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail={"error": "not found"})
        candidate = (root / path).resolve()
        # Real files only (icons, sw.js, manifest), and never outside dist.
        if path and candidate.is_file() and root in candidate.parents:
            headers = NO_CACHE if candidate.name in NO_CACHE_FILES else None
            return FileResponse(candidate, headers=headers)
        return FileResponse(index, headers=NO_CACHE)

    return True
