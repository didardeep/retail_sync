"""Deployment settings, all read from the environment (backend/.env).

Development needs none of these: the defaults keep the dev loop easy. On the
server, scripts/start-server.bat sets APP_ENV=production, which turns on the
stricter behaviour (/docs is closed, CORS is closed unless CORS_ORIGINS lists
origins). A weak JWT_SECRET only logs a warning for now (P2 in the TODOs).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(dotenv_path=BACKEND_DIR / ".env")

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PROD = APP_ENV == "production"

# Comma-separated origins allowed to call the API from another origin, for
# example the Android app: https://localhost,http://localhost
# Empty means: any origin in development, none in production. The website is
# served by the same process, so it never needs CORS.
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

# Where the built website lives. The default is <repo>/frontend/dist.
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST") or BACKEND_DIR.parent / "frontend" / "dist")

# Where app.log is written. The default is backend/logs.
LOG_DIR = Path(os.getenv("LOG_DIR") or BACKEND_DIR / "logs")
