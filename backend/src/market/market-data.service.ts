import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS } from '../common/redis';
import { hasRole } from '../config';
import { SYMBOLS, SYMBOL_LIST } from '../common/units';
import { MarketGateway } from './market.gateway';

const gauss = () => {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

/**
 * Simulated market feed (random walk with mean reversion) persisted into a TimescaleDB hypertable.
 * Swap `step()` for a real exchange WebSocket to go live; everything downstream stays the same.
 */
@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MarketDataService.name);
  private prices = new Map<string, number>(SYMBOL_LIST.map((s) => [s, SYMBOLS[s].start]));
  private buffer: { ts: Date; symbol: string; price: number }[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(@InjectDataSource() private ds: DataSource, @Inject(REDIS) private redis: Redis, private gateway: MarketGateway) {}

  async onModuleInit() {
    await this.initSchema(); // every node needs the table for reads
    if (!hasRole('marketdata')) return;
    await this.backfill();
    for (const s of SYMBOL_LIST) await this.redis.set(`price:${s}`, this.prices.get(s)!);
    this.timers.push(setInterval(() => this.tick(), 500), setInterval(() => this.flush().catch((e) => this.log.error(e.message)), 2000));
    this.log.log('market data simulator running');
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }

  private async initSchema() {
    // advisory lock: several replicas may boot at once and DDL like create_hypertable is not concurrency-safe
    const qr = this.ds.createQueryRunner();
    await qr.connect();
    try {
      await qr.query(`SELECT pg_advisory_lock(7331)`);
      await qr.query(`CREATE EXTENSION IF NOT EXISTS timescaledb`);
      await qr.query(`CREATE TABLE IF NOT EXISTS ticks (ts timestamptz NOT NULL, symbol text NOT NULL, price double precision NOT NULL)`);
      await qr.query(`SELECT create_hypertable('ticks', 'ts', if_not_exists => TRUE)`);
      await qr.query(`CREATE INDEX IF NOT EXISTS ticks_symbol_ts ON ticks (symbol, ts DESC)`);
      try {
        await qr.query(`SELECT add_retention_policy('ticks', INTERVAL '14 days', if_not_exists => TRUE)`);
      } catch (e: any) {
        this.log.warn(`retention policy not set: ${e.message}`);
      }
    } finally {
      await qr.query(`SELECT pg_advisory_unlock(7331)`).catch(() => undefined);
      await qr.release();
    }
  }

  private next(symbol: string, p: number, dt = 1): number {
    const start = SYMBOLS[symbol].start;
    const drift = ((start - p) / start) * 0.0005 * dt; // gentle mean reversion keeps prices in a sane band
    return Math.max(0.01, Math.round(p * (1 + drift + gauss() * 0.0004 * Math.sqrt(dt)) * 100) / 100);
  }

  /** On a fresh DB, seed 6h of history at 5s resolution so the chart isn't empty. */
  private async backfill() {
    const [{ n }] = await this.ds.query(`SELECT count(*)::int AS n FROM ticks`);
    if (n > 0) {
      for (const s of SYMBOL_LIST) {
        const [row] = await this.ds.query(`SELECT price FROM ticks WHERE symbol=$1 ORDER BY ts DESC LIMIT 1`, [s]);
        if (row) this.prices.set(s, row.price);
      }
      return;
    }
    const now = Date.now();
    for (const s of SYMBOL_LIST) {
      let p = SYMBOLS[s].start;
      const ts: Date[] = [], px: number[] = [];
      for (let t = now - 6 * 3600_000; t < now; t += 5000) {
        p = this.next(s, p, 10);
        ts.push(new Date(t));
        px.push(p);
      }
      await this.ds.query(`INSERT INTO ticks (ts, symbol, price) SELECT t, $3, p FROM unnest($1::timestamptz[], $2::float8[]) AS x(t, p)`, [ts, px, s]);
      this.prices.set(s, p);
    }
    this.log.log('seeded 6h of synthetic history');
  }

  private tick() {
    const ts = Date.now();
    for (const s of SYMBOL_LIST) {
      const p = this.next(s, this.prices.get(s)!);
      this.prices.set(s, p);
      this.buffer.push({ ts: new Date(ts), symbol: s, price: p });
      this.gateway.emitTick(s, p, ts);
      void this.redis.set(`price:${s}`, p);
    }
  }

  private async flush() {
    if (!this.buffer.length) return;
    const batch = this.buffer.splice(0);
    await this.ds.query(
      `INSERT INTO ticks (ts, symbol, price) SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::float8[])`,
      [batch.map((b) => b.ts), batch.map((b) => b.symbol), batch.map((b) => b.price)],
    );
  }

  async candles(symbol: string, interval: '1m' | '5m' | '15m') {
    const bucket = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes' }[interval];
    const rows = await this.ds.query(
      `SELECT extract(epoch FROM time_bucket($2::interval, ts))::bigint AS time,
              first(price, ts) AS open, max(price) AS high, min(price) AS low, last(price, ts) AS close
       FROM ticks WHERE symbol = $1 AND ts > now() - interval '6 hours'
       GROUP BY 1 ORDER BY 1`,
      [symbol, bucket],
    );
    return rows.map((r: any) => ({ time: Number(r.time), open: r.open, high: r.high, low: r.low, close: r.close }));
  }

  async recentPrices(symbol: string, limit = 200): Promise<number[]> {
    const rows = await this.ds.query(`SELECT price FROM ticks WHERE symbol=$1 ORDER BY ts DESC LIMIT $2`, [symbol, limit]);
    return rows.map((r: any) => r.price).reverse();
  }
}
