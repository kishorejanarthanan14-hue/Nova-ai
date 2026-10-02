from __future__ import annotations

from datetime import timedelta
from typing import List

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from . import models
from .auth import create_access_token, get_current_user, get_password_hash, verify_password
from .config import ACCESS_TOKEN_EXPIRE_MINUTES, MODEL_OPTIONS
from .database import Base, SessionLocal, engine, get_db
from .models import ChatMessage, ChatSession, Task, User, UserPreference
from .schemas import (
    ChatMessageIn,
    ChatMessageOut,
    ChatSessionCreate,
    ChatSessionOut,
    PreferenceOut,
    PreferenceUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
)
from .services.ai import AIProviderError, get_ai_client

Base.metadata.create_all(bind=engine)

app = FastAPI(title="NOVA AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "nova-ai"}


@app.get("/models")
def get_models():
    return {"models": MODEL_OPTIONS}


@app.post("/auth/register", response_model=UserOut)
def register_user(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    preference = UserPreference(user_id=user.id)
    db.add(preference)
    db.commit()

    return user


@app.post("/auth/login", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token(data={"sub": user.email}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/preferences", response_model=PreferenceOut)
def get_preferences(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if not pref:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref


@app.patch("/preferences", response_model=PreferenceOut)
def update_preferences(payload: PreferenceUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if not pref:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pref, field, value)

    db.commit()
    db.refresh(pref)
    return pref


@app.get("/sessions", response_model=List[ChatSessionOut])
def list_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(ChatSession).filter(ChatSession.user_id == current_user.id).order_by(ChatSession.updated_at.desc()).all()


@app.post("/sessions", response_model=ChatSessionOut)
def create_session(payload: ChatSessionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = ChatSession(user_id=current_user.id, title=payload.title or "New conversation")
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@app.get("/sessions/{session_id}/messages", response_model=List[ChatMessageOut])
def get_messages(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()


@app.post("/sessions/{session_id}/messages", response_model=ChatMessageOut)
def add_message(session_id: int, payload: ChatMessageIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    message = ChatMessage(session_id=session_id, role="user", content=payload.content, model=payload.model or "mock-local")
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@app.post("/chat/complete")
def complete_chat(payload: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session_id = payload.get("session_id")
    user_message = payload.get("message", "")
    model = payload.get("model", "mock-local")

    if not session_id:
        session = ChatSession(user_id=current_user.id, title=(user_message[:40] or "New conversation"))
        db.add(session)
        db.commit()
        db.refresh(session)
        session_id = session.id

    user_db_message = ChatMessage(session_id=session_id, role="user", content=str(user_message), model=str(model))
    db.add(user_db_message)
    db.commit()

    history = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    ai_messages = [{"role": msg.role, "content": msg.content} for msg in history]

    try:
        client = get_ai_client(model)
        reply_text = client.generate(ai_messages, model=model)
    except AIProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    assistant_message = ChatMessage(session_id=session_id, role="assistant", content=reply_text, model=str(model))
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    session.updated_at = __import__("datetime").datetime.utcnow()
    db.commit()

    return {"reply": reply_text, "session_id": session_id, "assistant_message_id": assistant_message.id}


@app.get("/tasks", response_model=List[TaskOut])
def list_tasks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.user_id == current_user.id).order_by(Task.created_at.desc()).all()


@app.post("/tasks", response_model=TaskOut)
def create_task(payload: TaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = Task(user_id=current_user.id, title=payload.title)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@app.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)
    return task


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"deleted": True}


@app.get("/")
def root():
    return {"message": "NOVA AI backend is running."}
