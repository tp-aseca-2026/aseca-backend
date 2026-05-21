export interface CostBasisPolicy {
  calculateAverageBuyPrice(
    totalBuyCost: number,
    totalBoughtQuantity: number,
  ): number;

  calculateCostBasis(quantity: number, averageBuyPrice: number): number;
}
