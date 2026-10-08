"""Rule-based technical signal (SMA crossover + RSI). Deliberately a heuristic, not a trained model."""
from __future__ import annotations


def sma(xs: list[float], n: int) -> float:
    return sum(xs[-n:]) / n


def rsi(xs: list[float], n: int = 14) -> float:
    gains = losses = 0.0
    for a, b in zip(xs[-n - 1:], xs[-n:]):
        d = b - a
        gains += max(d, 0.0)
        losses += max(-d, 0.0)
    if losses == 0:
        return 100.0 if gains > 0 else 50.0
    rs = (gains / n) / (losses / n)
    return 100.0 - 100.0 / (1.0 + rs)


def signal(prices: list[float], fast: int = 10, slow: int = 40) -> dict:
    if len(prices) < slow + 1:
        return {"signal": "HOLD", "confidence": 0.0, "reason": "not enough data"}
    f, s, r = sma(prices, fast), sma(prices, slow), rsi(prices)
    trend = (f - s) / s
    if trend > 0 and r < 70:
        sig, reason = "BUY", "fast SMA above slow SMA and RSI not overbought"
    elif trend < 0 and r > 30:
        sig, reason = "SELL", "fast SMA below slow SMA and RSI not oversold"
    else:
        sig, reason = "HOLD", "trend and RSI disagree (possible overbought/oversold)"
    return {
        "signal": sig,
        "confidence": round(min(abs(trend) * 200, 1.0), 2),
        "rsi": round(r, 1), "sma_fast": round(f, 2), "sma_slow": round(s, 2),
        "reason": reason,
        "disclaimer": "Heuristic on simulated data. Not financial advice.",
    }
