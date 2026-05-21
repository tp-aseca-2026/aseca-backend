import { Inject } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { COST_BASIS_POLICY } from './cost-basis-policy.token';
import type { CostBasisPolicy } from './cost-basis-policy';

export type TransactionWithStock = {
  stockId: number;
  quantity: number;
  price: Prisma.Decimal;
  type: TransactionType;
  stock: {
    ticker: string;
    companyName: string | null;
  };
};

export class PortfolioPositionAccumulator {
  readonly stockId: number;
  readonly ticker: string;
  readonly companyName: string | null;

  private quantity = 0;
  private totalBuyCost = 0;
  private totalBoughtQuantity = 0;

  constructor(
    transaction: TransactionWithStock,
    @Inject(COST_BASIS_POLICY)
    private readonly costBasisPolicy: CostBasisPolicy,
  ) {
    this.stockId = transaction.stockId;
    this.ticker = transaction.stock.ticker;
    this.companyName = transaction.stock.companyName;
  }

  apply(transaction: TransactionWithStock): void {
    if (transaction.type === TransactionType.BUY) {
      this.applyBuy(transaction);
      return;
    }

    this.applySell(transaction);
  }

  isActive(): boolean {
    return this.quantity > 0;
  }

  getQuantity(): number {
    return this.quantity;
  }

  getAverageBuyPrice(): number {
    return this.costBasisPolicy.calculateAverageBuyPrice(
      this.totalBuyCost,
      this.totalBoughtQuantity,
    );
  }

  getCostBasis(): number {
    return this.costBasisPolicy.calculateCostBasis(
      this.quantity,
      this.getAverageBuyPrice(),
    );
  }

  private applyBuy(transaction: TransactionWithStock): void {
    const price = transaction.price.toNumber();

    this.quantity += transaction.quantity;
    this.totalBuyCost += transaction.quantity * price;
    this.totalBoughtQuantity += transaction.quantity;
  }

  private applySell(transaction: TransactionWithStock): void {
    this.quantity -= transaction.quantity;
  }
}
