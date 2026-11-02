"""Photos and videos attached to audit answers and issues.

The file goes up here first and the answer or issue then stores the returned
{"type", "url", "name"} in its evidence list. Files need a signed-in user to
read, and their random names cannot be guessed.
"""
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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


@router.post("", status_code=201)
async def upload_evidence(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
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

    return {"type": FILE_TYPES[ext][0], "url": f"/api/evidence/{stored}", "name": file.filename}


@router.get("/{name}")
def read_evidence(name: str, user: User = Depends(get_current_user)):
    ext = Path(name).suffix.lower()
    path = EVIDENCE_FOLDER / name
    if not _STORED_NAME.match(name) or ext not in FILE_TYPES or not path.is_file():
        raise HTTPException(status_code=404, detail={"error": "not found"})
    return FileResponse(path, media_type=FILE_TYPES[ext][1],
                        headers={"X-Content-Type-Options": "nosniff"})
