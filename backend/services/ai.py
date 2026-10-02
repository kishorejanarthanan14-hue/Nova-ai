from __future__ import annotations

import json
from typing import Any, Dict, List

import httpx

from backend.config import ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY


class AIProviderError(Exception):
    pass


class MockAI:
    def __init__(self):
        self.system_prompt = "You are NOVA, a calm and capable assistant."

    def generate(self, messages: List[Dict[str, str]], model: str = "mock-local") -> str:
        user_messages = [m["content"] for m in messages if m["role"] == "user"]
        last_message = user_messages[-1] if user_messages else "Hello"
        return (
            f"Local mode response: I can help with planning, coding, writing, research, and task management. "
            f"Your latest request was: {last_message[:160]}"
        )


class AnthropicAI:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.anthropic.com/v1/messages"

    def generate(self, messages: List[Dict[str, str]], model: str = "claude-3-5-sonnet-latest") -> str:
        if not self.api_key:
            raise AIProviderError("Anthropic API key not configured")

        payload = {
            "model": model,
            "max_tokens": 1024,
            "messages": [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"],
            "system": "You are NOVA, a calm, capable personal AI assistant. Reply clearly and concisely.",
        }

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        with httpx.Client(timeout=60) as client:
            resp = client.post(self.base_url, headers=headers, json=payload)
            if resp.status_code >= 400:
                raise AIProviderError(f"Anthropic error: {resp.text[:500]}")
            data = resp.json()
            text_parts = []
            for block in data.get("content", []):
                if isinstance(block, dict):
                    text_parts.append(block.get("text", ""))
            return "".join(text_parts).strip() or "No response returned."


class OpenAICompatibleAI:
    def __init__(self, api_key: str, base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.base_url = base_url

    def generate(self, messages: List[Dict[str, str]], model: str = "gpt-4o-mini") -> str:
        if not self.api_key:
            raise AIProviderError("OpenAI API key not configured")

        payload = {
            "model": model,
            "messages": messages,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=60) as client:
            resp = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            if resp.status_code >= 400:
                raise AIProviderError(f"OpenAI error: {resp.text[:500]}")
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()


class GeminiAI:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def generate(self, messages: List[Dict[str, str]], model: str = "gemini-1.5-flash") -> str:
        if not self.api_key:
            raise AIProviderError("Gemini API key not configured")

        prompt = "\n".join(f"{m['role']}: {m['content']}" for m in messages)
        url = f"{self.base_url}/{model}:generateContent?key={self.api_key}"
        payload = {"contents": [{"parts": [{"text": prompt}]}]}

        with httpx.Client(timeout=60) as client:
            resp = client.post(url, json=payload)
            if resp.status_code >= 400:
                raise AIProviderError(f"Gemini error: {resp.text[:500]}")
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()


def get_ai_client(model: str):
    if model == "mock-local":
        return MockAI()
    if "claude" in model.lower():
        return AnthropicAI(ANTHROPIC_API_KEY or "")
    if "gpt" in model.lower() or "openai" in model.lower():
        return OpenAICompatibleAI(OPENAI_API_KEY or "")
    if "gemini" in model.lower():
        return GeminiAI(GEMINI_API_KEY or "")
    return MockAI()
