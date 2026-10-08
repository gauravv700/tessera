import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { CircuitBreaker } from '../common/circuit-breaker';
import { REDIS } from '../common/redis';
import { aiCalls } from '../common/metrics';
import { cfg } from '../config';
import { MarketDataService } from '../market/market-data.service';

export interface AnomalyResult { anomalous: boolean; score: number; reason: string }

@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private breaker = new CircuitBreaker(5, 30_000);

  constructor(@Inject(REDIS) private redis: Redis, private md: MarketDataService) {}

  private async call<T>(endpoint: string, body: unknown, timeoutMs = 25_000): Promise<T> {
    try {
      const res = await this.breaker.exec(async () => {
        const r = await fetch(`${cfg.aiUrl}${endpoint}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
        });
        if (!r.ok) throw new Error(`ai-service ${r.status}`);
        return (await r.json()) as T;
      });
      aiCalls.inc({ endpoint, result: 'ok' });
      return res;
    } catch (e: any) {
      aiCalls.inc({ endpoint, result: 'error' });
      throw e;
    }
  }

  async anomaly(prices: number[], price: number): Promise<AnomalyResult | null> {
    try {
      return await this.call<AnomalyResult>('/anomaly', { prices, price }, 2000);
    } catch {
      return null; // never let the AI side-car break trade processing
    }
  }

  async chat(question: string, symbol?: string) {
    let context = '';
    if (symbol) {
      const [price, depth] = await Promise.all([this.redis.get(`price:${symbol}`), this.redis.get(`depth:${symbol}`)]);
      const d = depth ? JSON.parse(depth) : { bids: [], asks: [] };
      context = `Market snapshot for ${symbol}: last price ${price ?? 'n/a'}, best bid ${d.bids[0]?.[0] ?? 'n/a'}, best ask ${d.asks[0]?.[0] ?? 'n/a'}.`;
    }
    try {
      return await this.call('/chat', { question, context });
    } catch {
      throw new ServiceUnavailableException('AI assistant is temporarily unavailable');
    }
  }

  async signal(symbol: string) {
    const prices = await this.md.recentPrices(symbol, 200);
    try {
      return await this.call('/signal', { symbol, prices });
    } catch {
      throw new ServiceUnavailableException('AI signal service is temporarily unavailable');
    }
  }

  async sentiment(text: string) {
    try {
      return await this.call('/sentiment', { text }, 5000);
    } catch {
      throw new ServiceUnavailableException('AI service unavailable');
    }
  }
}
