import {
  PortfolioPosition,
  PortfolioSummary,
} from '../ types/portfolio-position.type';

export class PortfolioCalculator {
  static buildSummary(positions: PortfolioPosition[]): PortfolioSummary {
    const totalCostBasis = this.sum(positions.map((p) => p.costBasis));
    const lastPriceUpdatedAt = this.findLastPriceUpdatedAt(positions);

    if (this.hasMissingPrices(positions)) {
      return {
        totalCostBasis: this.roundMoney(totalCostBasis),
        currentValue: null,
        profitLoss: null,
        profitLossPercentage: null,
        lastPriceUpdatedAt,
      };
    }

    const currentValue = this.sum(positions.map((p) => p.currentValue ?? 0));

    const profitLoss = currentValue - totalCostBasis;

    return {
      totalCostBasis: this.roundMoney(totalCostBasis),
      currentValue: this.roundMoney(currentValue),
      profitLoss: this.roundMoney(profitLoss),
      profitLossPercentage: this.calculatePercentage(
        profitLoss,
        totalCostBasis,
      ),
      lastPriceUpdatedAt,
    };
  }

  static roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  static roundPercentage(value: number): number {
    return Math.round(value * 100) / 100;
  }

  static calculatePercentage(value: number, base: number): number {
    if (base === 0) {
      return 0;
    }

    return this.roundPercentage((value / base) * 100);
  }

  private static hasMissingPrices(positions: PortfolioPosition[]): boolean {
    return positions.some((position) => position.currentValue === null);
  }

  private static sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
  }

  private static findLastPriceUpdatedAt(
    positions: PortfolioPosition[],
  ): Date | null {
    const dates = positions
      .map((position) => position.lastPriceUpdatedAt)
      .filter((date): date is Date => date !== null);

    if (!dates.length) {
      return null;
    }

    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }
}
