import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { AiController } from "./ai/ai.controller";
import { AiService } from "./ai/ai.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { JwtGuard } from "./auth/jwt.guard";
import { BotService } from "./bot/bot.service";
import { redisProvider } from "./common/redis";
import { cfg } from "./config";
import { eventBusProvider } from "./events/event-bus";
import { HealthController } from "./health/health.controller";
import { MatchingService } from "./matching/matching.service";
import { MarketController } from "./market/market.controller";
import { MarketDataService } from "./market/market-data.service";
import { MarketGateway } from "./market/market.gateway";
import { NotificationsController } from "./notifications/notifications.controller";
import { NotificationsService } from "./notifications/notifications.service";
import { Order, Trade, User, Wallet } from "./orders/entities";
import { OrdersController } from "./orders/orders.controller";
import { OrdersService } from "./orders/orders.service";
import { SettlementService } from "./wallet/settlement.service";
import { WalletController } from "./wallet/wallet.controller";
import { AppThrottlerGuard } from "./throttler.guard";

/**
 * One deployable, many roles: ROLES=api,matching,settlement,notifications,marketdata,bot (or "all").
 * In Kubernetes the same image runs as a scalable `api` Deployment and a single-replica `worker`.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        autoLogging: {
          ignore: (req) => ["/health", "/metrics"].includes((req as any).url),
        },
        redact: ["req.headers.authorization", "req.body.password"],
      },
    }),
    TypeOrmModule.forRoot({
      type: "postgres",
      url: cfg.dbUrl,
      entities: [User, Wallet, Order, Trade],
      synchronize: cfg.dbSync,
      retryAttempts: 20,
      retryDelay: 3000,
    }),
    JwtModule.register({ global: true, secret: cfg.jwtSecret }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [
    AuthController,
    OrdersController,
    WalletController,
    MarketController,
    NotificationsController,
    AiController,
    HealthController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    redisProvider,
    eventBusProvider,
    JwtGuard,
    AuthService,
    OrdersService,
    SettlementService,
    MatchingService,
    MarketGateway,
    MarketDataService,
    NotificationsService,
    AiService,
    BotService,
  ],
})
export class AppModule {}
