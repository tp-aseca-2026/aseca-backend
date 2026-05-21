import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { EdgarModule } from './edgar/edgar.module';
import { PriceSnapshotsModule } from './price-snapshots/price-snapshots.module';
import { StocksModule } from './stocks/stocks.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    AuthModule,
    StocksModule,
    PriceSnapshotsModule,
    TransactionsModule,
    EdgarModule,
  ],
})
export class AppModule {}
