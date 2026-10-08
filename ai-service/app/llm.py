"""LLM adapter. Order: Anthropic API (if key) -> Ollama (if reachable) -> extractive fallback (no LLM)."""
from __future__ import annotations

import os

import httpx

SYSTEM = (
    "You are a trading-platform assistant. Answer concisely using ONLY the provided context and market snapshot. "
    "If the context does not contain the answer, say so. Never give personalised financial advice."
)


def build_prompt(question: str, context: str, docs: list[dict]) -> str:
    ctx = "\n".join(f"[{i + 1}] {d['title']}: {d['text']}" for i, d in enumerate(docs)) or "(no documents found)"
    return f"{SYSTEM}\n\nMarket snapshot: {context or 'n/a'}\n\nDocuments:\n{ctx}\n\nQuestion: {question}\nAnswer:"


async def generate(prompt: str, docs: list[dict]) -> tuple[str, str]:
    key = os.getenv("ANTHROPIC_API_KEY")
    if key:
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                    json={"model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5"), "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]},
                )
                r.raise_for_status()
                return r.json()["content"][0]["text"], "anthropic"
        except Exception as exc:
            print(f"[llm] anthropic failed: {exc}")
    ollama = os.getenv("OLLAMA_URL")
    if ollama:
        try:
            async with httpx.AsyncClient(timeout=60) as c:
                r = await c.post(f"{ollama}/api/generate", json={"model": os.getenv("OLLAMA_MODEL", "llama3.2"), "prompt": prompt, "stream": False})
                r.raise_for_status()
                return r.json()["response"].strip(), "ollama"
        except Exception as exc:
            print(f"[llm] ollama failed: {exc}")
    if docs:
        return f"(No LLM configured - showing the most relevant note) {docs[0]['title']}: {docs[0]['text']}", "extractive"
    return "I couldn't find anything relevant in the knowledge base.", "extractive"
