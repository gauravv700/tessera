import { BadRequestException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { PRICE_DP, QTY_DP, SYMBOLS, formatScaled, parseDecimal } from '../common/units';
import { ordersPlaced } from '../common/metrics';
import { EVENT_BUS, EventBus, TOPIC_COMMANDS } from '../events/event-bus';
import { lockFunds } from '../wallet/wallet-sql';
import { SettlementService } from '../wallet/settlement.service';
import { Order } from './entities';
import { IsIn, IsString } from 'class-validator';

export class PlaceOrderDto {
  @IsIn(Object.keys(SYMBOLS)) symbol: string;
  @IsIn(['BUY', 'SELL']) side: 'BUY' | 'SELL';
  @IsString() price: string; // decimal string, e.g. "65000.50"
  @IsString() qty: string; // decimal string, e.g. "0.25"
}

export const orderView = (o: Order) => ({
  id: o.id, symbol: o.symbol, side: o.side, status: o.status,
  price: formatScaled(o.price, PRICE_DP), qty: formatScaled(o.qty, QTY_DP), filledQty: formatScaled(o.filledQty, QTY_DP),
  createdAt: o.createdAt,
});

@Injectable()
export class OrdersService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    @Inject(EVENT_BUS) private bus: EventBus,
    private settlement: SettlementService,
  ) {}

  async place(userId: string, dto: PlaceOrderDto) {
    const sym = SYMBOLS[dto.symbol];
    let price: number, qty: number;
    try {
      price = parseDecimal(dto.price, PRICE_DP);
      qty = parseDecimal(dto.qty, QTY_DP);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
    if (price <= 0 || qty <= 0) throw new BadRequestException('price and qty must be positive');

    const id = randomUUID();
    // 1) reserve funds + persist order atomically
    const order = await this.ds.transaction(async (m) => {
      const asset = dto.side === 'BUY' ? sym.quote : sym.base;
      const amount = dto.side === 'BUY' ? BigInt(price) * BigInt(qty) : BigInt(qty);
      if (!(await lockFunds(m, userId, asset, amount))) throw new BadRequestException(`Insufficient ${asset} balance`);
      return m.save(Order, { id, userId, symbol: dto.symbol, side: dto.side, price, qty, filledQty: 0, status: 'NEW' });
    });

    // 2) hand over to the matching engine through the event bus
    try {
      await this.bus.publish(TOPIC_COMMANDS, dto.symbol, { type: 'place', orderId: id, userId, symbol: dto.symbol, side: dto.side, price, qty });
    } catch {
      await this.settlement.cancelOrder(id); // compensate: release funds. (A transactional outbox would remove this gap.)
      throw new ServiceUnavailableException('Order queue unavailable, try again');
    }
    ordersPlaced.inc({ symbol: dto.symbol, side: dto.side });
    return orderView(order);
  }

  async cancel(userId: string, orderId: string) {
    const order = await this.ds.getRepository(Order).findOne({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'NEW' && order.status !== 'PARTIAL') throw new BadRequestException(`Order is ${order.status}`);
    await this.bus.publish(TOPIC_COMMANDS, order.symbol, { type: 'cancel', orderId, symbol: order.symbol });
    return { id: orderId, status: 'CANCEL_REQUESTED' };
  }

  async list(userId: string, limit = 50) {
    const rows = await this.ds.getRepository(Order).find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit });
    return rows.map(orderView);
  }
}
