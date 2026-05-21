import type { CostBasisPolicy } from './cost-basis-policy';

export class WeightedAverageCostBasisPolicy implements CostBasisPolicy {
  calculateAverageBuyPrice(
    totalBuyCost: number,
    totalBoughtQuantity: number,
  ): number {
    if (totalBoughtQuantity === 0) {
      return 0;
    }

    return totalBuyCost / totalBoughtQuantity;
  }

  calculateCostBasis(quantity: number, averageBuyPrice: number): number {
    return quantity * averageBuyPrice;
  }
}
