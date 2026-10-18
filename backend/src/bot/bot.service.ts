import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { AuthService } from "../auth/auth.service";
import { REDIS } from "../common/redis";
import { cfg, hasRole } from "../config";
import { PRICE_DP, SYMBOL_LIST } from "../common/units";
import { OrdersService } from "../orders/orders.service";

const RICH = { USDT: "50000000", BTC: "5000", ETH: "50000", SOL: "500000" };
const fixed = (n: number, dp: number) => n.toFixed(dp);

/** Two system users: a maker that quotes both sides around the feed price and a taker that crosses the spread. */
@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BotService.name);
  private timer?: NodeJS.Timeout;
  private live: { id: string; at: number }[] = [];
  private busy = false;

  constructor(
    private auth: AuthService,
    private orders: OrdersService,
    @Inject(REDIS) private redis: Redis,
  ) {}

  async onModuleInit() {
    if (!hasRole("bot") || !cfg.botEnabled) return;
    const maker = await this.auth.ensureSystemUser(
      "bot-maker@system.local",
      RICH,
    );
    const taker = await this.auth.ensureSystemUser(
      "bot-taker@system.local",
      RICH,
    );
    this.timer = setInterval(() => void this.run(maker, taker), 1500);
    this.log.log("market-maker bots running");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(maker: string, taker: string) {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const symbol of SYMBOL_LIST) {
        const mid = Number(await this.redis.get(`price:${symbol}`));
        if (!mid) continue;
        const qty = fixed(0.01 + Math.random() * 0.5, 3);
        const spread = 0.0004 + Math.random() * 0.0025;
        for (const [side, px] of [
          ["BUY", mid * (1 - spread)],
          ["SELL", mid * (1 + spread)],
        ] as const) {
          const o = await this.orders.place(maker, {
            symbol,
            side,
            price: fixed(px, PRICE_DP),
            qty,
          });
          this.live.push({ id: o.id, at: Date.now() });
        }
        if (Math.random() < 0.6) {
          const side = Math.random() < 0.5 ? "BUY" : "SELL";
          const px = side === "BUY" ? mid * 1.003 : mid * 0.997; // crosses resting maker quotes
          await this.orders
            .place(taker, {
              symbol,
              side,
              price: fixed(px, PRICE_DP),
              qty: fixed(0.005 + Math.random() * 0.2, 3),
            })
            .catch(() => undefined);
        }
      }
      // keep the book bounded: cancel maker quotes older than 20s
      const cutoff = Date.now() - 20_000;
      const stale = this.live.filter((o) => o.at < cutoff);
      this.live = this.live.filter((o) => o.at >= cutoff);
      for (const o of stale)
        await this.orders.cancel(maker, o.id).catch(() => undefined);
    } catch (e: any) {
      this.log.warn(`bot cycle failed: ${e.message}`);
    } finally {
      this.busy = false;
    }
  }
}
