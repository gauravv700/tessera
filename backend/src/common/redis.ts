import Redis from "ioredis";
import { cfg } from "../config";

export const REDIS = "REDIS";
export const redisProvider = {
  provide: REDIS,
  useFactory: () => new Redis(cfg.redisUrl, { maxRetriesPerRequest: null }),
};
