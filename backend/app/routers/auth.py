from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user, make_token, verify_password
from ..db import get_db
from ..models import User
from ..schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower()).first()
    if not user or not verify_password(user, body.password):
        raise HTTPException(status_code=401, detail={"error": "invalid credentials"})
    return {"token": make_token(user), "user": user.to_dict()}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user.to_dict()
