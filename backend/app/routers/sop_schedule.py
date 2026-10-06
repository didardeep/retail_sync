"""Scheduling SOP audits for auditors (manager only). Filled in by the scheduling stream."""
from fastapi import APIRouter

router = APIRouter(prefix="/api/sop-schedule", tags=["sop-schedule"])
