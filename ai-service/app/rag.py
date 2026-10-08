"""Tiny dependency-free RAG: hashed bag-of-words embeddings + cosine search.

Store backends:
  * MemoryStore  - default, zero infra.
  * PgVectorStore - used when DATABASE_URL is set and reachable (pgvector extension).
Swap `embed()` for a real embedding model (e.g. via Ollama / an API) without touching the stores.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
from pathlib import Path

DIM = 256
_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "is", "are", "of", "to", "and", "in", "on", "for", "as", "it", "by", "or", "at", "be", "this", "that", "with"}


def tokens(text: str) -> list[str]:
    words = [w for w in _TOKEN.findall(text.lower()) if w not in _STOP]
    return words + [f"{a}_{b}" for a, b in zip(words, words[1:])]


def embed(text: str) -> list[float]:
    vec = [0.0] * DIM
    for tok in tokens(text):
        h = int.from_bytes(hashlib.sha1(tok.encode()).digest()[:4], "big")
        vec[h % DIM] += 1.0 if (h >> 31) & 1 else -1.0  # signed hashing reduces collision bias
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


class MemoryStore:
    def __init__(self) -> None:
        self.docs: list[dict] = []
        self.vecs: list[list[float]] = []

    def add(self, docs: list[dict]) -> None:
        for d in docs:
            self.docs.append(d)
            self.vecs.append(embed(d["title"] + " " + d["text"]))

    def search(self, query: str, k: int = 3) -> list[dict]:
        q = embed(query)
        scored = sorted(((cosine(q, v), d) for v, d in zip(self.vecs, self.docs)), key=lambda x: x[0], reverse=True)
        return [{**d, "score": round(s, 4)} for s, d in scored[:k] if s > 0.05]


class PgVectorStore:
    def __init__(self, url: str) -> None:
        import psycopg  # imported lazily so the service runs without a DB

        self.conn = psycopg.connect(url, autocommit=True)
        self.conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        self.conn.execute(
            f"CREATE TABLE IF NOT EXISTS news_docs (id int PRIMARY KEY, title text, body text, embedding vector({DIM}))"
        )

    @staticmethod
    def _lit(v: list[float]) -> str:
        return "[" + ",".join(f"{x:.6f}" for x in v) + "]"

    def add(self, docs: list[dict]) -> None:
        for d in docs:
            self.conn.execute(
                "INSERT INTO news_docs (id, title, body, embedding) VALUES (%s,%s,%s,%s::vector) ON CONFLICT (id) DO NOTHING",
                (d["id"], d["title"], d["text"], self._lit(embed(d["title"] + " " + d["text"]))),
            )

    def search(self, query: str, k: int = 3) -> list[dict]:
        rows = self.conn.execute(
            "SELECT id, title, body, 1 - (embedding <=> %s::vector) AS score FROM news_docs ORDER BY embedding <=> %s::vector LIMIT %s",
            (self._lit(embed(query)), self._lit(embed(query)), k),
        ).fetchall()
        return [{"id": r[0], "title": r[1], "text": r[2], "score": round(float(r[3]), 4)} for r in rows if r[3] > 0.05]


def load_store():
    docs = json.loads((Path(__file__).parent.parent / "data" / "news.json").read_text())
    url = os.getenv("DATABASE_URL")
    if url:
        try:
            store = PgVectorStore(url)
            store.add(docs)
            return store, "pgvector"
        except Exception as exc:  # DB down or extension missing -> degrade gracefully
            print(f"[rag] pgvector unavailable ({exc}); using in-memory store")
    store = MemoryStore()
    store.add(docs)
    return store, "memory"
