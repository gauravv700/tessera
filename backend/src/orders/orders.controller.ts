import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../auth/jwt.guard';
import { OrdersService, PlaceOrderDto } from './orders.service';

@Controller('orders')
@UseGuards(JwtGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post() @Throttle({ default: { limit: 120, ttl: 60_000 } })
  place(@Req() req: any, @Body() dto: PlaceOrderDto) { return this.orders.place(req.user.id, dto); }

  @Delete(':id') cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) { return this.orders.cancel(req.user.id, id); }

  @Get() list(@Req() req: any) { return this.orders.list(req.user.id); }
}
