import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/infrastructure/jwt-auth.guard';
import { PriceSnapshotsService } from './service/price-snapshots.service';

@Controller('price-snapshots')
@UseGuards(JwtAuthGuard)
export class PriceSnapshotsController {
  constructor(private readonly priceSnapshotsService: PriceSnapshotsService) {}

  @Get('latest')
  async getLatestSnapshots() {
    return this.priceSnapshotsService.getLatestSnapshots();
  }

  @Get('latest/:ticker')
  async getLatestSnapshotByTicker(@Param('ticker') ticker: string) {
    return this.priceSnapshotsService.getLatestSnapshotByTicker(ticker);
  }

}
