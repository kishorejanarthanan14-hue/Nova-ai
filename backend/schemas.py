from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSessionCreate(BaseModel):
    title: Optional[str] = None


class ChatSessionOut(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatMessageIn(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000)
    model: Optional[str] = "mock-local"


class ChatMessageOut(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    model: str
    created_at: datetime

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None


class TaskOut(BaseModel):
    id: int
    title: str
    completed: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PreferenceOut(BaseModel):
    preferred_model: str = "mock-local"
    theme: str = "dark"
    voice_enabled: bool = False

    class Config:
        from_attributes = True


class PreferenceUpdate(BaseModel):
    preferred_model: Optional[str] = None
    theme: Optional[str] = None
    voice_enabled: Optional[bool] = None
