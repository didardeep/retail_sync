"""Access log: backend/logs/app.log (rotating, 5 MB x 5) and the console.

One line per state-changing request (POST/PUT/PATCH/DELETE) and per failed
request (4xx/5xx): status, method, path, who, how long, and for failures the
error text. Request bodies and query strings are never logged, because they
carry passwords. This is separate from the audit_log database table.
"""
import logging
import time
from logging.handlers import RotatingFileHandler

import jwt
from fastapi import FastAPI, Request

from .auth import ALGO, SECRET
from .settings import LOG_DIR

LOGGER_NAME = "retail_sync.access"
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def setup_logging() -> logging.Logger:
    """Create the logger once. Safe to call again (tests, reloads)."""
    logger = logging.getLogger(LOGGER_NAME)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    logger.propagate = False
    fmt = logging.Formatter("%(asctime)s %(message)s")
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    for handler in (
        RotatingFileHandler(LOG_DIR / "app.log", maxBytes=5 * 1024 * 1024,
                            backupCount=5, encoding="utf-8"),
        logging.StreamHandler(),
    ):
        handler.setFormatter(fmt)
        logger.addHandler(handler)
    return logger


def _who(request: Request) -> str:
    """Name, id and role from the token, without a database lookup."""
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return "anonymous"
    try:
        p = jwt.decode(header[7:], SECRET, algorithms=[ALGO])
    except jwt.PyJWTError:
        return "invalid-token"
    return f"{p.get('name')} ({p.get('sub')}, {p.get('role')})"


def add_request_logging(app: FastAPI) -> None:
    logger = setup_logging()

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception("500 %s %s user=%s", request.method, request.url.path, _who(request))
            raise
        ms = int((time.perf_counter() - started) * 1000)
        status = response.status_code
        if request.method in WRITE_METHODS or status >= 400:
            detail = getattr(request.state, "error_detail", None)
            extra = f" error={detail}" if detail else ""
            logger.info("%s %s %s user=%s %dms%s", status, request.method,
                        request.url.path, _who(request), ms, extra)
        return response
