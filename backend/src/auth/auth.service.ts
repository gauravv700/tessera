import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { cfg } from '../config';
import { ASSETS, ASSET_DP } from '../common/units';
import { User } from '../orders/entities';
import { REDIS } from '../common/redis';

const DEMO_FUNDS: Record<string, string> = { USDT: '100000', BTC: '2', ETH: '30', SOL: '500' };

export interface Tokens { accessToken: string; refreshToken: string }

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    @Inject(REDIS) private redis: Redis,
    private jwt: JwtService,
  ) {}

  async register(email: string, password: string, funds: Record<string, string> = DEMO_FUNDS): Promise<Tokens> {
    const exists = await this.ds.getRepository(User).findOne({ where: { email: email.toLowerCase() } });
    if (exists) throw new ConflictException('Email already registered');
    const user = await this.createUser(email, password, funds);
    return this.issue(user.id);
  }

  async login(email: string, password: string): Promise<Tokens> {
    const user = await this.ds.getRepository(User).findOne({ where: { email: email.toLowerCase() } });
    // compare even when user is missing to keep timing roughly constant
    const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid.');
    if (!user || !ok) throw new UnauthorizedException('Invalid credentials');
    return this.issue(user.id);
  }

  /** Refresh-token rotation with reuse detection: a used/unknown token revokes the whole family. */
  async refresh(token: string): Promise<Tokens> {
    let payload: { sub: string; jti: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.typ !== 'refresh') throw new UnauthorizedException('Invalid refresh token');
    const key = `rt:${payload.sub}:${payload.jti}`;
    const deleted = await this.redis.del(key);
    if (!deleted) {
      await this.revokeAll(payload.sub);
      throw new UnauthorizedException('Refresh token reuse detected; please log in again');
    }
    return this.issue(payload.sub);
  }

  async logout(userId: string): Promise<void> {
    await this.revokeAll(userId);
  }

  /** Idempotent helper used by market-maker bots. */
  async ensureSystemUser(email: string, funds: Record<string, string>): Promise<string> {
    const found = await this.ds.getRepository(User).findOne({ where: { email } });
    if (found) return found.id;
    return (await this.createUser(email, randomUUID(), funds)).id;
  }

  private async createUser(email: string, password: string, funds: Record<string, string>): Promise<User> {
    if (password.length < 8) throw new BadRequestException('Password too short');
    const passwordHash = await bcrypt.hash(password, 10);
    return this.ds.transaction(async (m) => {
      const user = await m.save(User, { email: email.toLowerCase(), passwordHash });
      for (const asset of ASSETS) {
        const amount = BigInt(funds[asset] ?? '0') * 10n ** BigInt(ASSET_DP[asset]);
        await m.query(`INSERT INTO wallets (user_id, asset, available, locked) VALUES ($1,$2,$3,0)`, [user.id, asset, amount.toString()]);
      }
      return user;
    });
  }

  private async issue(userId: string): Promise<Tokens> {
    const jti = randomUUID();
    const accessToken = await this.jwt.signAsync({ sub: userId, typ: 'access' }, { expiresIn: cfg.accessTtl });
    const refreshToken = await this.jwt.signAsync({ sub: userId, jti, typ: 'refresh' }, { expiresIn: cfg.refreshTtlSec });
    await this.redis.set(`rt:${userId}:${jti}`, '1', 'EX', cfg.refreshTtlSec);
    return { accessToken, refreshToken };
  }

  private async revokeAll(userId: string): Promise<void> {
    const keys = await this.redis.keys(`rt:${userId}:*`); // fine at demo scale; use a per-user SET at large scale
    if (keys.length) await this.redis.del(...keys);
  }
}
