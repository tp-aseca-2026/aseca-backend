import { Inject, Injectable } from '@nestjs/common';

import type { RoundingPolicy } from './rounding-policy';
import { ROUNDING_POLICY } from './rounding-policy.token';
import {
  PortfolioPosition,
  PortfolioSummary,
} from '../ types/portfolio-position.type';

@Injectable()
export class PortfolioCalculator {
  constructor(
    @Inject(ROUNDING_POLICY)
    private readonly roundingPolicy: RoundingPolicy,
  ) {}

  buildSummary(positions: PortfolioPosition[]): PortfolioSummary {
    const totalCostBasis = this.sum(positions.map((p) => p.costBasis));
    const realizedProfitLoss = this.sum(
      positions.map((p) => p.realizedProfitLoss),
    );
    const lastPriceUpdatedAt = this.findLastPriceUpdatedAt(positions);

    if (this.hasMissingPrices(positions)) {
      return {
        totalCostBasis: this.roundingPolicy.roundMoney(totalCostBasis),
        currentValue: null,
        unrealizedProfitLoss: null,
        unrealizedProfitLossPercentage: null,
        realizedProfitLoss: this.roundingPolicy.roundMoney(realizedProfitLoss),
        totalProfitLoss: null,
        lastPriceUpdatedAt,
      };
    }

    const currentValue = this.sum(positions.map((p) => p.currentValue ?? 0));
    const unrealizedProfitLoss = currentValue - totalCostBasis;

    return {
      totalCostBasis: this.roundingPolicy.roundMoney(totalCostBasis),
      currentValue: this.roundingPolicy.roundMoney(currentValue),
      unrealizedProfitLoss:
        this.roundingPolicy.roundMoney(unrealizedProfitLoss),
      unrealizedProfitLossPercentage: this.calculatePercentage(
        unrealizedProfitLoss,
        totalCostBasis,
      ),
      realizedProfitLoss: this.roundingPolicy.roundMoney(realizedProfitLoss),
      totalProfitLoss: this.roundingPolicy.roundMoney(
        realizedProfitLoss + unrealizedProfitLoss,
      ),
      lastPriceUpdatedAt,
    };
  }

  calculatePercentage(value: number, base: number): number {
    if (base === 0) {
      return 0;
    }

    return this.roundingPolicy.roundPercentage((value / base) * 100);
  }

  roundMoney(value: number): number {
    return this.roundingPolicy.roundMoney(value);
  }

  private hasMissingPrices(positions: PortfolioPosition[]): boolean {
    return positions.some((position) => position.currentValue === null);
  }

  private sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private findLastPriceUpdatedAt(positions: PortfolioPosition[]): Date | null {
    const dates = positions
      .map((position) => position.lastPriceUpdatedAt)
      .filter((date): date is Date => date !== null);

    if (!dates.length) {
      return null;
    }

    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }
}
