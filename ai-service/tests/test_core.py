import math
import random

from app import anomaly, rag, sentiment, signals


def walk(n=100, start=100.0, vol=0.0004, seed=1):
    random.seed(seed)
    out = [start]
    for _ in range(n - 1):
        out.append(out[-1] * math.exp(random.gauss(0, vol)))
    return out


def test_anomaly_flags_spike_not_noise():
    p = walk()
    assert anomaly.score(p, p[-1] * 1.0004)["anomalous"] is False
    assert anomaly.score(p, p[-1] * 1.03)["anomalous"] is True


def test_anomaly_needs_history():
    assert anomaly.score([100.0] * 5, 130.0)["anomalous"] is False


def test_signal_uptrend_and_downtrend():
    up = [100 + i * 0.05 + (0.3 if i % 3 == 0 else 0) for i in range(80)]
    down = [100 - i * 0.05 - (0.3 if i % 3 == 0 else 0) for i in range(80)]
    assert signals.signal(up)["signal"] in {"BUY", "HOLD"}
    assert signals.signal(down)["signal"] in {"SELL", "HOLD"}
    assert signals.signal([1.0] * 5)["signal"] == "HOLD"


def test_rsi_bounds():
    assert signals.rsi(list(range(1, 40))) == 100.0
    assert 0 <= signals.rsi(walk(60)) <= 100


def test_rag_retrieves_relevant_doc():
    store, kind = rag.load_store()
    assert kind == "memory"
    top = store.search("how does price-time priority matching work", k=1)[0]
    assert "priority" in top["title"].lower()
    assert store.search("what is a limit order", k=1)[0]["id"] == 4


def test_sentiment():
    assert sentiment.sentiment("Bitcoin surges to record high on strong inflows")["label"] == "positive"
    assert sentiment.sentiment("Exchange hack triggers crash and heavy liquidations")["label"] == "negative"
    assert sentiment.sentiment("The market opened")["label"] == "neutral"
