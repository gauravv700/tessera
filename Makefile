.PHONY: up down obs logs test load-orders load-ws
up:            ; docker compose up --build -d
down:          ; docker compose down
obs:           ; docker compose -f docker-compose.yml -f docker-compose.observability.yml up --build -d
logs:          ; docker compose logs -f --tail=100 api worker
test:          ; cd backend && npm install && npm test && cd ../ai-service && pip install -r requirements.txt && pytest -q
load-orders:   ; k6 run -e BASE=http://localhost:8080 infra/k6/orders-load.js
load-ws:       ; k6 run -e WS=ws://localhost:8080 infra/k6/ws-load.js
