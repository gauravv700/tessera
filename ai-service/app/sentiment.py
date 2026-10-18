"""Lexicon-based sentiment (fast, offline). Replace with an LLM/FinBERT call for higher accuracy."""
import re

POS = {"surge", "rally", "gain", "gains", "bullish", "record", "high", "growth", "upgrade", "inflows", "adoption", "strong", "profit", "beat", "recover", "support"}
NEG = {"crash", "plunge", "drop", "bearish", "loss", "losses", "hack", "ban", "lawsuit", "outflows", "fear", "weak", "liquidation", "liquidations", "fraud", "decline", "selloff"}

def sentiment(text: str) -> dict:
    words = re.findall(r"[a-z]+", text.lower())
    pos, neg = sum(w in POS for w in words), sum(w in NEG for w in words)
    total = pos + neg
    score = 0.0 if total == 0 else (pos - neg) / total
    label = "positive" if score > 0.2 else "negative" if score < -0.2 else "neutral"
    return {"label": label, "score": round(score, 2), "positive_hits": pos, "negative_hits": neg}
