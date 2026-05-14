import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { CurrentPriceProvider } from './price/current-price-provider';
import { MockCurrentPriceProvider } from './price/mock-current-price.provider';
import { TransactionsRepository } from './repository/transactions.repository';
import { TransactionsService } from './service/transactions.service';
import { TransactionsController } from './transactions.controller';

@Module({
  imports: [StocksModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionsRepository,
    {
      provide: CurrentPriceProvider,
      useClass: MockCurrentPriceProvider,
    },
  ],
})
export class TransactionsModule {}