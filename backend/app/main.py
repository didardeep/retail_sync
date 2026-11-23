import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .db import init_db
from .request_log import add_request_logging
from .routers import (
    admin, annexures, audit_log, audits, auth, availability, brands, checklists, chat, dashboard,
    data, evidence, exceptions, issues, notifications, observations, people, questions, stores,
    uploads,
)
from .services.alerts import alert_loop
from .settings import CORS_ORIGINS, FRONTEND_DIST, IS_PROD
from .spa import mount_frontend


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    alerts = asyncio.create_task(alert_loop())
    yield
    alerts.cancel()


# In production the interactive API docs are closed (they list every route).
app = FastAPI(
    title="Retail Sync API", lifespan=lifespan,
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None if IS_PROD else "/redoc",
    openapi_url=None if IS_PROD else "/openapi.json",
)

# The website is served by this same process, so it never needs CORS. Other
# origins (the Android app) are listed in CORS_ORIGINS. With nothing listed:
# any origin in development, none in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ([] if IS_PROD else ["*"]),
    allow_methods=["*"],
    allow_headers=["*"],
)
add_request_logging(app)

for router in (
    auth.router, admin.router, brands.router, stores.router, questions.router, checklists.router,
    audits.router, availability.router, issues.router, observations.router,
    data.router, dashboard.router, uploads.router, evidence.router, audit_log.router,
    chat.router, exceptions.router, notifications.router, annexures.router, people.router,
):
    app.include_router(router)


@app.api_route("/api/health", methods=["GET", "HEAD"])  # monitors often probe with HEAD
def health():
    return {"status": "ok"}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Preserve the frontend's {"error": ...} contract regardless of whether
    a route raised a plain string or a structured dict as its detail."""
    body = exc.detail if isinstance(exc.detail, dict) else {"error": exc.detail}
    request.state.error_detail = body.get("error")  # for the access log
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = " -> ".join(str(p) for p in first.get("loc", []))
    message = f"{loc}: {first.get('msg')}" if loc else str(first.get("msg", "invalid request"))
    request.state.error_detail = message  # for the access log
    return JSONResponse(status_code=422, content={"error": message})


# Last, so every /api route above wins. Does nothing when frontend/dist is absent.
mount_frontend(app, FRONTEND_DIST)
