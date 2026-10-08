import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtGuard } from '../auth/jwt.guard';
import { ASSET_DP, formatScaled } from '../common/units';
import { Wallet } from '../orders/entities';

@Controller('wallet')
@UseGuards(JwtGuard)
export class WalletController {
  constructor(@InjectDataSource() private ds: DataSource) {}

  @Get()
  async balances(@Req() req: any) {
    const rows = await this.ds.getRepository(Wallet).find({ where: { userId: req.user.id }, order: { asset: 'ASC' } });
    return rows.map((w) => ({
      asset: w.asset,
      available: formatScaled(w.available, ASSET_DP[w.asset]),
      locked: formatScaled(w.locked, ASSET_DP[w.asset]),
    }));
  }
}
