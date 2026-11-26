"""Photos and videos attached to audit answers and issues.

The file goes up here first and the answer or issue then stores the returned
{"type", "url", "name"} in its evidence list. When the device shared where it
was, the item also carries "geo": {"lat", "lng", "accuracy", "captured_at"}. Files need a signed-in user to
read, and their random names cannot be guessed.
"""
import datetime as dt
import math
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..auth import get_current_user
from ..models import User

router = APIRouter(prefix="/api/evidence", tags=["evidence"])

EVIDENCE_FOLDER = Path(__file__).parent.parent.parent / "uploads" / "evidence"
EVIDENCE_FOLDER.mkdir(parents=True, exist_ok=True)

MAX_BYTES = 50 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024

# Extension -> (evidence type, media type served back). SVG and HTML stay out:
# a browser would run scripts inside them.
FILE_TYPES = {
    ".jpg": ("photo", "image/jpeg"),
    ".jpeg": ("photo", "image/jpeg"),
    ".png": ("photo", "image/png"),
    ".webp": ("photo", "image/webp"),
    ".gif": ("photo", "image/gif"),
    ".mp4": ("video", "video/mp4"),
    ".mov": ("video", "video/quicktime"),
    ".webm": ("video", "video/webm"),
}

_STORED_NAME = re.compile(r"^[0-9a-f]{32}\.[a-z0-9]+$")


def _geo(lat, lng, accuracy, captured_at):
    """The location sent with a photo, or None when there is none. A location
    that is out of range is refused rather than stored wrong."""
    if lat is None and lng is None:
        return None
    if lat is None or lng is None or not (
            math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=422, detail={"error": "location must have a valid lat and lng"})
    when = None
    if captured_at:
        try:
            when = dt.datetime.fromisoformat(captured_at.replace("Z", "+00:00")).isoformat()
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "captured_at must be an ISO date-time"})
    return {
        "lat": round(lat, 6), "lng": round(lng, 6),
        "accuracy": round(accuracy, 1) if accuracy is not None and math.isfinite(accuracy) and accuracy >= 0 else None,
        "captured_at": when or dt.datetime.utcnow().isoformat(),
    }


@router.post("", status_code=201)
async def upload_evidence(
    file: UploadFile = File(...),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    accuracy: float | None = Form(None),
    captured_at: str | None = Form(None),
    user: User = Depends(get_current_user),
):
    geo = _geo(lat, lng, accuracy, captured_at)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in FILE_TYPES:
        raise HTTPException(status_code=422, detail={
            "error": "only photos (jpg, png, webp, gif) and videos (mp4, mov, webm) are accepted"})

    stored = f"{uuid.uuid4().hex}{ext}"
    path = EVIDENCE_FOLDER / stored
    size = 0
    try:
        with path.open("wb") as out:
            while chunk := await file.read(CHUNK_BYTES):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail={
                        "error": f"file is larger than {MAX_BYTES // (1024 * 1024)} MB"})
                out.write(chunk)
        if size == 0:
            raise HTTPException(status_code=422, detail={"error": "file is empty"})
    except HTTPException:
        path.unlink(missing_ok=True)
        raise

    item = {"type": FILE_TYPES[ext][0], "url": f"/api/evidence/{stored}", "name": file.filename}
    if geo:
        item["geo"] = geo
    return item


@router.get("/{name}")
def read_evidence(name: str, user: User = Depends(get_current_user)):
    ext = Path(name).suffix.lower()
    path = EVIDENCE_FOLDER / name
    if not _STORED_NAME.match(name) or ext not in FILE_TYPES or not path.is_file():
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return FileResponse(path, media_type=FILE_TYPES[ext][1],
                        headers={"X-Content-Type-Options": "nosniff"})
