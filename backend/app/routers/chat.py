"""POST /api/chat — AI Assistant endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import User
from ..schemas import ChatRequest, ChatResponse
from ..services.assistant_service import run_chat

router = APIRouter(prefix="/api")


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = run_chat(
        db=db,
        user=user,
        messages=[m.model_dump() for m in body.messages],
        conversation_id=body.conversation_id,
    )
    return ChatResponse(**result)
