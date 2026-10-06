"""Editing and publishing SOP audit tools as new versions (manager only). Filled in by the questionnaire-editor stream."""
from fastapi import APIRouter

router = APIRouter(prefix="/api/sop-admin", tags=["sop-admin"])
