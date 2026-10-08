import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, Unique } from 'typeorm';

const toNumber = { to: (v: number) => v, from: (v: string | number) => Number(v) };

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column() email: string;
  @Column({ name: 'password_hash' }) passwordHash: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('wallets')
@Unique(['userId', 'asset'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column() asset: string;
  /** Scaled integer (see common/units). bigint comes back from pg as string. */
  @Column({ type: 'bigint', default: 0 }) available: string;
  @Column({ type: 'bigint', default: 0 }) locked: string;
}

@Entity('orders')
@Index(['userId', 'createdAt'])
@Index(['status', 'symbol'])
export class Order {
  @PrimaryColumn('uuid') id: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column() symbol: string;
  @Column() side: 'BUY' | 'SELL';
  @Column({ type: 'bigint', transformer: toNumber }) price: number;
  @Column({ type: 'bigint', transformer: toNumber }) qty: number;
  @Column({ name: 'filled_qty', type: 'bigint', default: 0, transformer: toNumber }) filledQty: number;
  @Column({ default: 'NEW' }) status: 'NEW' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

@Entity('trades')
@Index(['symbol', 'createdAt'])
export class Trade {
  /** Deterministic id (takerOrderId:seq) => settlement is idempotent under Kafka redelivery. */
  @PrimaryColumn('varchar') id: string;
  @Column() symbol: string;
  @Column({ type: 'bigint', transformer: toNumber }) price: number;
  @Column({ type: 'bigint', transformer: toNumber }) qty: number;
  @Column({ name: 'buy_order_id', type: 'uuid' }) buyOrderId: string;
  @Column({ name: 'sell_order_id', type: 'uuid' }) sellOrderId: string;
  @Column({ name: 'buyer_id', type: 'uuid' }) buyerId: string;
  @Column({ name: 'seller_id', type: 'uuid' }) sellerId: string;
  @Column({ name: 'taker_side' }) takerSide: 'BUY' | 'SELL';
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
