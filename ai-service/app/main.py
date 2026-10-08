from fastapi import FastAPI
from pydantic import BaseModel, Field

from . import anomaly, llm, rag, sentiment, signals

app = FastAPI(title="Trading AI service", version="1.0.0")
store, store_kind = rag.load_store()


class ChatIn(BaseModel):
    question: str = Field(max_length=1000)
    context: str = ""


class AnomalyIn(BaseModel):
    prices: list[float] = Field(max_length=1000)
    price: float = Field(gt=0)


class SignalIn(BaseModel):
    symbol: str = ""
    prices: list[float] = Field(max_length=2000)


class SentimentIn(BaseModel):
    text: str = Field(max_length=5000)


@app.get("/health")
def health():
    return {"status": "ok", "vector_store": store_kind}


@app.post("/chat")
async def chat(body: ChatIn):
    docs = store.search(body.question, k=3)
    answer, provider = await llm.generate(llm.build_prompt(body.question, body.context, docs), docs)
    return {"answer": answer, "provider": provider, "sources": [{"id": d["id"], "title": d["title"], "score": d["score"]} for d in docs]}


@app.post("/anomaly")
def detect(body: AnomalyIn):
    return anomaly.score(body.prices, body.price)


@app.post("/signal")
def signal(body: SignalIn):
    return {"symbol": body.symbol, **signals.signal(body.prices)}


@app.post("/sentiment")
def sent(body: SentimentIn):
    return sentiment.sentiment(body.text)
