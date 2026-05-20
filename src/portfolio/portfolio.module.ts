import { Module } from '@nestjs/common';
import { PriceSnapshotsModule } from '../price-snapshots/price-snapshots.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PortfolioService } from './service/portfolio.service';
import { PortfolioController } from './ portfolio.controller';

@Module({
  imports: [TransactionsModule, PriceSnapshotsModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
