from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .db import init_db
from .routers import (
    audits, auth, availability, checklists, dashboard, data, issues,
    observations, questions, stores, uploads,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Retail Sync API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (
    auth.router, stores.router, questions.router, checklists.router,
    audits.router, availability.router, issues.router, observations.router,
    data.router, dashboard.router, uploads.router,
):
    app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Preserve the frontend's {"error": ...} contract regardless of whether
    a route raised a plain string or a structured dict as its detail."""
    body = exc.detail if isinstance(exc.detail, dict) else {"error": exc.detail}
    return JSONResponse(status_code=exc.status_code, content=body)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = " -> ".join(str(p) for p in first.get("loc", []))
    message = f"{loc}: {first.get('msg')}" if loc else str(first.get("msg", "invalid request"))
    return JSONResponse(status_code=422, content={"error": message})
