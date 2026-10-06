"""Manager review of submitted SOP audits. Filled in by the review stream."""
from fastapi import APIRouter

router = APIRouter(prefix="/api/sop-review", tags=["sop-review"])
