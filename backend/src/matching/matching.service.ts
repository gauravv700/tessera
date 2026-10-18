import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import Redis from "ioredis";
import { DataSource } from "typeorm";
import { REDIS } from "../common/redis";
import { hasRole } from "../config";
import { matchLatency, tradesExecuted } from "../common/metrics";
import { PRICE_DP, QTY_DP, SYMBOL_LIST, formatScaled } from "../common/units";
import {
  Command,
  EVENT_BUS,
  EventBus,
  MatchingEvent,
  TOPIC_COMMANDS,
  TOPIC_EVENTS,
} from "../events/event-bus";
import { MarketGateway } from "../market/market.gateway";
import { Order } from "../orders/entities";
import { OrderBook } from "./order-book";

/**
 * Single-writer matching engine: consumes ordered commands per symbol, mutates the in-memory book,
 * emits events (event log) and a Redis read-model of the book (CQRS read side).
 * Run ONE instance per symbol shard; the book lives in this process's memory.
 */
@Injectable()
export class MatchingService implements OnModuleInit {
  private readonly log = new Logger(MatchingService.name);
  private books = new Map<string, OrderBook>(SYMBOL_LIST.map((s) => [s, new OrderBook()]));
  private depthTimers = new Set<string>();

  constructor(
    @InjectDataSource() private ds: DataSource,
    @Inject(EVENT_BUS) private bus: EventBus,
    @Inject(REDIS) private redis: Redis,
    private gateway: MarketGateway,
  ) {}

  async onModuleInit() {
    if (!hasRole("matching")) return;
    await this.rebuildBooks();
    await this.bus.subscribe<Command>(TOPIC_COMMANDS, "matching", (c) =>
      this.handle(c),
    );
    this.log.log("matching engine ready");
  }

  /** Recover state after a restart from open orders in Postgres (the source of truth). */
  private async rebuildBooks() {
    const open = await this.ds.getRepository(Order).find({
      where: [{ status: "NEW" }, { status: "PARTIAL" }],
      order: { createdAt: "ASC" },
    });
    for (const o of open) {
      this.books.get(o.symbol)?.rest({
        id: o.id,
        userId: o.userId,
        side: o.side,
        price: o.price,
        remaining: o.qty - o.filledQty,
      });
    }
    for (const s of SYMBOL_LIST) await this.publishDepth(s);
    this.log.log(`rebuilt books from ${open.length} open orders`);
  }

  async handle(cmd: Command): Promise<void> {
    const book = this.books.get(cmd.symbol);
    if (!book) return;
    const t0 = process.hrtime.bigint();

    if (cmd.type === "place") {
      if (book.has(cmd.orderId)) return; // redelivery
      const row = await this.ds
        .getRepository(Order)
        .findOne({ where: { id: cmd.orderId } });
      if (!row || row.status !== "NEW" || row.filledQty > 0) return; // cancelled meanwhile or already processed
      const { fills, stpCancelled } = book.submit({
        id: cmd.orderId,
        userId: cmd.userId,
        side: cmd.side,
        price: cmd.price,
        remaining: cmd.qty,
      });
      const now = Date.now();
      for (const f of fills) {
        const ev: MatchingEvent = {
          type: "trade",
          id: `${f.takerOrderId}:${f.seq}`,
          symbol: cmd.symbol,
          price: f.price,
          qty: f.qty,
          takerSide: f.takerSide,
          buyOrderId: f.buyOrderId,
          sellOrderId: f.sellOrderId,
          buyerId: f.buyerId,
          sellerId: f.sellerId,
          buyLimit: f.buyLimit,
          ts: now,
        };
        await this.bus.publish(TOPIC_EVENTS, cmd.symbol, ev);
        tradesExecuted.inc({ symbol: cmd.symbol });
        this.gateway.emitTrade(cmd.symbol, {
          id: ev.id,
          price: formatScaled(f.price, PRICE_DP),
          qty: formatScaled(f.qty, QTY_DP),
          side: f.takerSide,
          ts: now,
        });
      }
      if (stpCancelled)
        await this.bus.publish(TOPIC_EVENTS, cmd.symbol, {
          type: "cancel",
          symbol: cmd.symbol,
          orderId: cmd.orderId,
          reason: "STP",
          ts: now,
        });
    } else {
      const removed = book.cancel(cmd.orderId);
      if (removed)
        await this.bus.publish(TOPIC_EVENTS, cmd.symbol, {
          type: "cancel",
          symbol: cmd.symbol,
          orderId: cmd.orderId,
          reason: "USER",
          ts: Date.now(),
        });
    }

    matchLatency.observe(Number(process.hrtime.bigint() - t0) / 1e9);
    this.scheduleDepth(cmd.symbol);
  }

  /** Coalesce depth broadcasts to at most ~20/s per symbol. */
  private scheduleDepth(symbol: string) {
    if (this.depthTimers.has(symbol)) return;
    this.depthTimers.add(symbol);
    setTimeout(() => {
      this.depthTimers.delete(symbol);
      this.publishDepth(symbol).catch((e) => this.log.error(e.message));
    }, 50);
  }

  private async publishDepth(symbol: string) {
    const d = this.books.get(symbol)!.depth(20);
    const fmt = (rows: [number, number][]) =>
      rows.map(([p, q]) => [
        formatScaled(p, PRICE_DP),
        formatScaled(q, QTY_DP),
      ]);
    const snapshot = {
      symbol,
      bids: fmt(d.bids),
      asks: fmt(d.asks),
      ts: Date.now(),
    };
    await this.redis.set(`depth:${symbol}`, JSON.stringify(snapshot)); // read model for REST + new WS subscribers
    this.gateway.emitDepth(symbol, snapshot);
  }
}
