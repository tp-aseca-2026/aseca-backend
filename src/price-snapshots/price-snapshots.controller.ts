import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/infrastructure/jwt-auth.guard';
import { UpdatePriceSnapshotsDto } from './dto/update-price-snapshots.dto';
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

  @Post('update')
  async update(@Body() dto: UpdatePriceSnapshotsDto) {
    return this.priceSnapshotsService.runUpdate(dto.tickers);
  }
}
