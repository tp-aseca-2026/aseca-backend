import { Inject, Injectable } from '@nestjs/common';

import type { RoundingPolicy } from './rounding-policy';
import { ROUNDING_POLICY } from './rounding-policy.token';
import type { MissingPricePolicy } from './missing-price-policy';
import type { PortfolioPositionAccumulator } from './portfolio-position-accumulator';
import { PortfolioPosition } from '../ types/portfolio-position.type';

@Injectable()
export class NullMissingPricePolicy implements MissingPricePolicy {
  constructor(
    @Inject(ROUNDING_POLICY)
    private readonly roundingPolicy: RoundingPolicy,
  ) {}

  buildPositionWithoutPrice(
    position: PortfolioPositionAccumulator,
  ): PortfolioPosition {
    return {
      stockId: position.stockId,
      ticker: position.ticker,
      companyName: position.companyName,
      quantity: position.getQuantity(),
      averageBuyPrice: this.roundingPolicy.roundMoney(
        position.getAverageBuyPrice(),
      ),
      costBasis: this.roundingPolicy.roundMoney(position.getCostBasis()),
      latestPrice: null,
      currentValue: null,
      unrealizedProfitLoss: null,
      unrealizedProfitLossPercentage: null,
      realizedProfitLoss: this.roundingPolicy.roundMoney(
        position.getRealizedProfitLoss(),
      ),
      totalProfitLoss: null,
      lastPriceUpdatedAt: null,
    };
  }
}
