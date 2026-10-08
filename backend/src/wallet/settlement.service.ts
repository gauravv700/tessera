import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { hasRole } from '../config';
import { SYMBOLS } from '../common/units';
import { EVENT_BUS, EventBus, MatchingEvent, TOPIC_EVENTS } from '../events/event-bus';
import { adjust, exec } from './wallet-sql';

/**
 * Consumes matching.events and applies them to Postgres (orders, trades, wallets) in one ACID transaction.
 * Every handler is idempotent so Kafka's at-least-once delivery is safe.
 */
@Injectable()
export class SettlementService implements OnModuleInit {
  private readonly log = new Logger(SettlementService.name);
  constructor(@InjectDataSource() private ds: DataSource, @Inject(EVENT_BUS) private bus: EventBus) {}

  async onModuleInit() {
    if (hasRole('settlement')) await this.bus.subscribe<MatchingEvent>(TOPIC_EVENTS, 'settlement', (e) => this.handle(e));
  }

  handle(e: MatchingEvent): Promise<void> {
    return e.type === 'trade' ? this.onTrade(e) : this.cancelOrder(e.orderId).then(() => undefined);
  }

  private async onTrade(e: Extract<MatchingEvent, { type: 'trade' }>): Promise<void> {
    const sym = SYMBOLS[e.symbol];
    const qty = BigInt(e.qty);
    const cost = BigInt(e.price) * qty; // quote units (8dp)
    const reserved = BigInt(e.buyLimit) * qty; // what the buyer had locked for this fill

    await this.ds.transaction(async (m) => {
      const ins = await exec(
        m,
        `INSERT INTO trades (id, symbol, price, qty, buy_order_id, sell_order_id, buyer_id, seller_id, taker_side, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10::double precision / 1000))
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [e.id, e.symbol, e.price, e.qty, e.buyOrderId, e.sellOrderId, e.buyerId, e.sellerId, e.takerSide, e.ts],
      );
      if (ins.length === 0) return; // already settled (redelivery)

      for (const orderId of [e.buyOrderId, e.sellOrderId]) {
        await exec(
          m,
          `UPDATE orders SET filled_qty = filled_qty + $2::bigint,
             status = CASE WHEN filled_qty + $2::bigint >= qty THEN 'FILLED' ELSE 'PARTIAL' END
           WHERE id = $1`,
          [orderId, e.qty],
        );
      }
      // buyer: pays `cost` out of the reserved amount, gets the surplus back, receives base asset
      await adjust(m, e.buyerId, sym.quote, reserved, reserved - cost);
      await adjust(m, e.buyerId, sym.base, 0n, qty);
      // seller: releases locked base, receives quote
      await adjust(m, e.sellerId, sym.base, qty, 0n);
      await adjust(m, e.sellerId, sym.quote, 0n, cost);
    });
  }

  /** Cancels an open order and releases whatever is still locked for it. Idempotent. */
  async cancelOrder(orderId: string): Promise<boolean> {
    return this.ds.transaction(async (m) => {
      const rows = await exec(
        m,
        `UPDATE orders SET status = 'CANCELLED' WHERE id = $1 AND status IN ('NEW','PARTIAL')
         RETURNING user_id, symbol, side, price, qty, filled_qty`,
        [orderId],
      );
      if (rows.length === 0) return false;
      const o = rows[0];
      const sym = SYMBOLS[o.symbol];
      const remaining = BigInt(o.qty) - BigInt(o.filled_qty);
      if (o.side === 'BUY') await adjust(m, o.user_id, sym.quote, BigInt(o.price) * remaining, BigInt(o.price) * remaining);
      else await adjust(m, o.user_id, sym.base, remaining, remaining);
      return true;
    });
  }
}
