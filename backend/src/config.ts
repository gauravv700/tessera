import "dotenv/config";
const isProd = process.env.NODE_ENV === "production";

export const cfg = {
  port: Number(process.env.PORT ?? 4000),
  dbUrl: process.env.DATABASE_URL ??
    "postgres://trading:trading@localhost:5432/trading",
  dbSync: (process.env.DB_SYNC ?? "true") === "true", // use migrations instead in a real prod rollout
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  mongoUrl: process.env.MONGO_URL ?? "",
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? "localhost:9092")
    .split(",")
    .filter(Boolean),
  kafkaPartitions: Number(process.env.KAFKA_PARTITIONS ?? 3),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  accessTtl: process.env.ACCESS_TTL ?? "15m",
  refreshTtlSec: Number(process.env.REFRESH_TTL_SEC ?? 7 * 24 * 3600),
  aiUrl: process.env.AI_SERVICE_URL ?? "http://localhost:8000",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  roles: new Set((process.env.ROLES ?? "all").split(",").map((s) => s.trim())),
  botEnabled: (process.env.BOT_ENABLED ?? "true") === "true",
};

if (isProd && cfg.jwtSecret === "dev-secret-change-me") {
  throw new Error("JWT_SECRET must be set in production");
}

/** A process can run any subset of: api, matching, settlement, notifications, marketdata, bot. */
export const hasRole = (role: string): boolean =>
  cfg.roles.has("all") || cfg.roles.has(role);

console.log(cfg.kafkaBrokers)