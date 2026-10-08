"""Robust outlier detection on price moves (median/MAD is not skewed by the outliers it is hunting)."""
from __future__ import annotations

import math
import statistics


def score(prices: list[float], price: float, min_history: int = 20, z_threshold: float = 8.0, min_move: float = 0.004) -> dict:
    if len(prices) < min_history:
        return {"anomalous": False, "score": 0.0, "reason": "not enough history"}
    rets = [math.log(b / a) for a, b in zip(prices, prices[1:]) if a > 0 and b > 0]
    if not rets:
        return {"anomalous": False, "score": 0.0, "reason": "no returns"}
    med = statistics.median(rets)
    mad = statistics.median(abs(r - med) for r in rets) or 1e-9
    move = math.log(price / prices[-1])
    z = abs(move - med) / (1.4826 * mad)
    anomalous = z > z_threshold and abs(move) > min_move  # need both statistical and economic significance
    reason = f"{move * 100:+.2f}% move vs last price (robust z={z:.1f})" if anomalous else "within normal range"
    return {"anomalous": anomalous, "score": round(z, 2), "reason": reason}
