import { Module } from '@nestjs/common';
import { PriceSnapshotsModule } from '../price-snapshots/price-snapshots.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { PortfolioService } from './service/portfolio.service';
import { PortfolioController } from './ portfolio.controller';
import { MISSING_PRICE_POLICY } from './domain/missing-price-policy.token';
import { NullMissingPricePolicy } from './domain/null-missing-price-policy';
import { PortfolioCalculator } from './domain/portfolio-calculator';
import { COST_BASIS_POLICY } from './domain/cost-basis-policy.token';
import { FifoCostBasisPolicy } from './domain/fifo-cost-basis-policy';
import { ROUNDING_POLICY } from './domain/rounding-policy.token';
import { TwoDecimalRoundingPolicy } from './domain/two-decimal-rounding.policy';

@Module({
  imports: [TransactionsModule, PriceSnapshotsModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioCalculator,
    {
      provide: MISSING_PRICE_POLICY,
      useClass: NullMissingPricePolicy,
    },
    {
      provide: COST_BASIS_POLICY,
      useClass: FifoCostBasisPolicy,
    },
    {
      provide: ROUNDING_POLICY,
      useClass: TwoDecimalRoundingPolicy,
    },
  ],
})
export class PortfolioModule {}
