import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import Redis from "ioredis";
import { DataSource } from "typeorm";
import { REDIS } from "../common/redis";
import {
  PRICE_DP,
  QTY_DP,
  SYMBOLS,
  SYMBOL_LIST,
  formatScaled,
} from "../common/units";
import { Trade } from "../orders/entities";
import { MarketDataService } from "./market-data.service";

const assertSymbol = (s: string) => {
  if (!SYMBOLS[s])
    throw new BadRequestException(
      `unknown symbol; use one of ${SYMBOL_LIST.join(", ")}`,
    );
  return s;
};

@Controller("market")
export class MarketController {
  constructor(
    private md: MarketDataService,
    @Inject(REDIS) private redis: Redis,
    @InjectDataSource() private ds: DataSource,
  ) {}

  @Get("symbols") symbols() {
    return SYMBOL_LIST;
  }

  @Get("candles")
  candles(@Query("symbol") symbol: string, @Query("interval") interval = "1m") {
    if (!["1m", "5m", "15m"].includes(interval))
      throw new BadRequestException("interval must be 1m, 5m or 15m");
    return this.md.candles(
      assertSymbol(symbol),
      interval as "1m" | "5m" | "15m",
    );
  }

  @Get("depth")
  async depth(@Query("symbol") symbol: string) {
    const raw = await this.redis.get(`depth:${assertSymbol(symbol)}`); // CQRS read model written by the matching engine
    return raw
      ? JSON.parse(raw)
      : { symbol, bids: [], asks: [], ts: Date.now() };
  }

  @Get("trades")
  async trades(@Query("symbol") symbol: string) {
    const rows = await this.ds.getRepository(Trade).find({
      where: { symbol: assertSymbol(symbol) },
      order: { createdAt: "DESC" },
      take: 50,
    });
    return rows.map((t) => ({
      id: t.id,
      price: formatScaled(t.price, PRICE_DP),
      qty: formatScaled(t.qty, QTY_DP),
      side: t.takerSide,
      ts: t.createdAt.getTime(),
    }));
  }
}
