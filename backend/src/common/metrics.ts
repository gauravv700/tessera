import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const ordersPlaced = new Counter({ name: 'orders_placed_total', help: 'Orders accepted', labelNames: ['symbol', 'side'], registers: [registry] });
export const tradesExecuted = new Counter({ name: 'trades_executed_total', help: 'Trades matched', labelNames: ['symbol'], registers: [registry] });
export const matchLatency = new Histogram({
  name: 'matching_latency_seconds', help: 'Time to run one command through the matching engine',
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1], registers: [registry],
});
export const wsConnections = new Gauge({ name: 'ws_connections', help: 'Open WebSocket connections on this node', registers: [registry] });
export const aiCalls = new Counter({ name: 'ai_calls_total', help: 'Calls to the AI service', labelNames: ['endpoint', 'result'], registers: [registry] });
export const anomaliesFlagged = new Counter({ name: 'anomalies_flagged_total', help: 'Trades flagged by anomaly detector', registers: [registry] });
