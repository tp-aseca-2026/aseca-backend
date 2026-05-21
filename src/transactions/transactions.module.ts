import { Module } from '@nestjs/common';
import { PriceSnapshotsModule } from '../price-snapshots/price-snapshots.module';
import { StocksModule } from '../stocks/stocks.module';
import { TransactionsRepository } from './repository/transactions.repository';
import { TransactionsService } from './service/transactions.service';
import { TransactionsController } from './transactions.controller';

@Module({
  imports: [StocksModule, PriceSnapshotsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository],
  exports: [TransactionsService, TransactionsRepository]
})
export class TransactionsModule {}
