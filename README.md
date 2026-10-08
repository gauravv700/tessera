# Tessera — real-time trading platform

An event-driven trading platform: price-time-priority matching engine, Kafka event log, WebSocket fan-out that scales horizontally, TimescaleDB market data, MongoDB notifications, a Python AI service (RAG assistant, anomaly detection, technical signals), and full observability. Everything is free and self-hosted with Docker.

## Quick start

Requires Docker with Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

| What | Where |
|---|---|
| Trading UI | http://localhost:3000 |
| API + WebSocket (nginx → 2 API replicas) | http://localhost:8080 |

1. Open the UI and create a demo account (starts with 100,000 USDT, 2 BTC, 30 ETH, 500 SOL of play money).
2. Market-maker bots quote both sides and a taker bot crosses the spread, so the book and trade tape are live immediately.
3. Place a limit order from the form. Fills show up in *Activity*, balances update, and the chart streams ticks.

Optional extras:

```bash
make obs                                   # + Prometheus, Grafana (:3001 admin/admin), Jaeger (:16686), Loki
docker compose --profile llm up -d         # + Ollama; then: docker compose exec ollama ollama pull llama3.2
                                           #   and set OLLAMA_URL=http://ollama:11434 in .env
make load-orders                           # k6 load tests (needs k6 installed)
make load-ws
```

The assistant works with **no LLM at all** (extractive answers from the knowledge base). Set `ANTHROPIC_API_KEY` or `OLLAMA_URL` for generated answers.

Without Docker, the backend also runs against local Postgres(Timescale) + Redis with no Kafka (`KAFKA_BROKERS` unset → in-memory event bus).

## Architecture

```mermaid
flowchart LR
  UI[Next.js UI] -->|REST + WS| LB[nginx]
  LB --> API1[API replica]
  LB --> API2[API replica]
  API1 & API2 -->|orders.commands| K[(Kafka)]
  K -->|consume| M[Matching engine<br/>in-memory book, single writer]
  M -->|matching.events| K
  M -->|depth snapshot| R[(Redis)]
  M -->|emit| R
  R -.socket.io adapter.-> API1 & API2
  K --> S[Settlement] --> PG[(Postgres/Timescale<br/>orders · trades · wallets · ticks)]
  K --> N[Notifications] --> MG[(MongoDB)]
  N -->|anomaly check| AI[FastAPI AI service<br/>RAG · signals · anomaly]
  AI --> PV[(pgvector)]
  API1 & API2 -->|/ai/*| AI
```

**Order lifecycle**

1. `POST /orders` → one Postgres transaction locks funds and inserts the order → publishes a `place` command to `orders.commands` (keyed by symbol).
2. The matching engine (single writer per symbol shard) consumes commands in order, matches with price-time priority, and publishes `trade` / `cancel` events to `matching.events`.
3. Independent consumer groups react to the same event log: **settlement** (ACID update of orders, trades, wallets), **notifications** (MongoDB + WebSocket push + anomaly check).
4. The matching engine writes the book to Redis (`depth:<symbol>`) — the CQRS read model behind `GET /market/depth` and the WebSocket snapshots.

**Roles.** One image, selected by `ROLES=api,matching,settlement,notifications,marketdata,bot`. `api` is stateless and scales horizontally; the others run as a single-replica worker (in Compose and Kubernetes).

## Design decisions worth discussing

- **Exact money math.** Prices, quantities and balances are scaled integers (`BigInt` at the wallet boundary); no floats touch money. Verified by a 20k-order simulation: totals conserved, no negative balances, nothing left locked after cancels.
- **Matching engine.** Sorted price arrays + FIFO queues per level, fills at the maker's price, self-trade prevention (cancel newest), deterministic fill ids (`takerOrderId:seq`).
- **Idempotent, at-least-once processing.** Kafka may redeliver; trade insert is `ON CONFLICT DO NOTHING`, cancels are status-guarded, the matching engine skips orders already on the book.
- **Ordering.** Kafka key = symbol → one partition per symbol → strict per-symbol ordering. Trades and cancels share one topic so consumers can't see them out of order.
- **Crash recovery.** The matching engine rebuilds its book from open orders in Postgres on boot.
- **WebSocket scaling.** `websocket`-only transport (no sticky sessions) + `@socket.io/redis-adapter`; any process can emit to any client.
- **Auth.** Short-lived JWT access tokens + rotating refresh tokens in Redis with reuse detection (a replayed refresh token revokes the whole session family); bcrypt; helmet; validation pipes; per-route rate limits.
- **Resilience.** Circuit breaker + timeouts around the AI service; AI failures never block trade processing.
- **Observability.** Prometheus metrics (orders/s, trades/s, matching latency histogram, WS connections, AI calls), OpenTelemetry → Jaeger, JSON logs → Loki, provisioned Grafana dashboard.

## Repository layout

```
backend/      NestJS (TypeScript): API, WebSocket gateway, matching engine, settlement, bots
frontend/     Next.js 14 App Router (TypeScript): trading terminal
ai-service/   FastAPI: RAG (memory or pgvector), anomaly detection, SMA/RSI signal, sentiment
infra/        nginx, Prometheus, Grafana, Loki, Kubernetes manifests, k6 scripts
docker-compose.yml · docker-compose.observability.yml · .github/workflows/ci.yml · Makefile
```

## Tests

```bash
cd backend && npm install && npm test          # matching engine, units, circuit breaker
cd ai-service && pip install -r requirements.txt && pytest -q
```

## Status and known limitations

Be upfront about these in an interview — they show you understand the trade-offs.

- **Build status.** The code was written and unit-tested in a sandbox without internet or Docker: the matching engine (7 tests), the AI-service logic (6 tests) and the settlement arithmetic (simulation) were executed; all TypeScript was syntax-checked. `npm install`, the Nest/Next builds and `docker compose up` have **not** been run end-to-end yet, so expect to fix a small compile or config error on first run. `package-lock.json` files are not included (CI uses `npm install`).
- **Simulated market data.** Prices are a random walk seeded on first boot. The feed is one function (`MarketDataService.next`) you can replace with a real exchange WebSocket.
- **Limit orders only.** No market orders, fees, or margin.
- **Transactional outbox missing.** If Kafka is down after the order row commits, the order is compensated (cancelled + funds released), but a crash in that window could leave funds locked. A transactional outbox closes this gap.
- **Matching engine is a single writer per shard**, in memory. Scale by sharding symbols across workers, not by adding replicas. Failover is "restart and rebuild from Postgres".
- **Schema.** `DB_SYNC=true` uses TypeORM auto-sync for convenience. Use migrations in production (Kubernetes config sets it to false).
- **Not included:** TOTP 2FA, Helm chart (plain Kubernetes manifests instead), ELK (Loki is used for logs), stateful data stores in Kubernetes (use managed Postgres/Redis/Kafka), Redis-backed rate-limit storage, a real trained ML model (signals are a documented SMA/RSI heuristic).
- **Tokens** are stored in `localStorage` for simplicity; httpOnly cookies are safer against XSS.

## Cost

Everything runs free on your machine. Optional paid pieces: the Anthropic API (pay-per-token; Ollama is the free alternative) and cloud hosting if you deploy the Kubernetes manifests.
