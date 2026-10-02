import os
from pathlib import Path
from typing import List

BASE_DIR = Path(__file__).resolve().parent.parent

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nova.db")
SECRET_KEY = os.getenv("SECRET_KEY", "nova-dev-secret-key-change-me")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

MODEL_OPTIONS: List[str] = [
    "mock-local",
    "claude-3-5-sonnet-latest",
    "gpt-4o-mini",
    "gemini-1.5-flash",
]

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
