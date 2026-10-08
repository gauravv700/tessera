import { Controller, Get, Header, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { REDIS } from '../common/redis';
import { registry } from '../common/metrics';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(@InjectDataSource() private ds: DataSource, @Inject(REDIS) private redis: Redis) {}

  @Get('health')
  async health() {
    try {
      await Promise.all([this.ds.query('SELECT 1'), this.redis.ping()]);
      return { status: 'ok' };
    } catch (e: any) {
      throw new ServiceUnavailableException(e.message);
    }
  }

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  metrics() { return registry.metrics(); }
}
