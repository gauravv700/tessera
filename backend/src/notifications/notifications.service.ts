import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import mongoose, { Model, Schema } from "mongoose";
import { anomaliesFlagged } from "../common/metrics";
import { cfg, hasRole } from "../config";
import { PRICE_DP, QTY_DP, formatScaled } from "../common/units";
import {
  EVENT_BUS,
  EventBus,
  MatchingEvent,
  TOPIC_EVENTS,
} from "../events/event-bus";
import { MarketGateway } from "../market/market.gateway";
import { AiService } from "../ai/ai.service";

interface Notif {
  userId: string;
  type: "TRADE" | "CANCEL" | "ALERT";
  message: string;
  meta?: unknown;
  createdAt: Date;
}

/** Kafka consumer #3 on the event log: writes user notifications to MongoDB, pushes them over WS, runs anomaly checks. */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly log = new Logger(NotificationsService.name);
  private model?: Model<Notif>;
  private history = new Map<string, number[]>();

  constructor(
    @Inject(EVENT_BUS) private bus: EventBus,
    private gateway: MarketGateway,
    private ai: AiService,
  ) {}

  async onModuleInit() {
    if (cfg.mongoUrl) {
      await mongoose.connect(cfg.mongoUrl);
      this.model =
        (mongoose.models.Notification as Model<Notif> | undefined) ??
        mongoose.model<Notif>(
          "Notification",
          new Schema<Notif>({
            userId: { type: String, index: true },
            type: String,
            message: String,
            meta: Schema.Types.Mixed,
            createdAt: {
              type: Date,
              default: Date.now,
              expires: 60 * 60 * 24 * 30,
            },
          }),
        );
    } else {
      this.log.warn(
        "MONGO_URL not set: notifications are pushed over WebSocket but not stored",
      );
    }
    if (hasRole("notifications"))
      await this.bus.subscribe<MatchingEvent>(
        TOPIC_EVENTS,
        "notifications",
        (e) => this.handle(e),
      );
  }

  async list(userId: string) {
    if (!this.model) return [];
    return this.model.find({ userId }).sort({ createdAt: -1 }).limit(30).lean();
  }

  private async notify(
    userId: string,
    type: Notif["type"],
    message: string,
    meta?: unknown,
  ) {
    const doc = { userId, type, message, meta, createdAt: new Date() };
    await this.model?.create(doc);
    this.gateway.emitToUser(userId, "notification", doc);
  }

  private async handle(e: MatchingEvent) {
    if (e.type === "cancel") return; // cancel notifications need the owner id; kept out of the hot path for now
    const price = formatScaled(e.price, PRICE_DP);
    const qty = formatScaled(e.qty, QTY_DP);
    await this.notify(
      e.buyerId,
      "TRADE",
      `Bought ${qty} ${e.symbol.split("-")[0]} @ ${price}`,
      { tradeId: e.id },
    );
    await this.notify(
      e.sellerId,
      "TRADE",
      `Sold ${qty} ${e.symbol.split("-")[0]} @ ${price}`,
      { tradeId: e.id },
    );

    // anomaly detection via the Python service (best effort; circuit-broken)
    const hist = this.history.get(e.symbol) ?? [];
    const px = e.price / 10 ** PRICE_DP;
    if (hist.length >= 30) {
      const res = await this.ai.anomaly(hist, px);
      if (res?.anomalous) {
        anomaliesFlagged.inc();
        const msg = `Unusual trade on ${e.symbol}: ${res.reason}`;
        await this.notify(e.buyerId, "ALERT", msg, res);
        await this.notify(e.sellerId, "ALERT", msg, res);
      }
    }
    hist.push(px);
    if (hist.length > 200) hist.shift();
    this.history.set(e.symbol, hist);
  }
}
