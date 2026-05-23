import { TransactionType } from '@prisma/client';
import type { CostBasisPolicy } from './cost-basis-policy';
import type { PositionLot } from './position-lot.type';
import { TransactionWithStock } from '../../transactions/domain/transaction.entity';

export class PortfolioPositionAccumulator {
  readonly stockId: number;
  readonly ticker: string;
  readonly companyName: string | null;

  private readonly lots: PositionLot[] = [];
  private realizedProfitLoss = 0;

  constructor(
    transaction: TransactionWithStock,
    private readonly costBasisPolicy: CostBasisPolicy,
  ) {
    this.stockId = transaction.stockId;
    this.ticker = transaction.stock.ticker;
    this.companyName = transaction.stock.companyName;
  }

  apply(transaction: TransactionWithStock): void {
    if (transaction.type === TransactionType.BUY) {
      this.costBasisPolicy.applyBuy(this.lots, transaction);
      return;
    }

    const sellResult = this.costBasisPolicy.applySell(this.lots, transaction);
    this.realizedProfitLoss += sellResult.realizedProfitLoss;
  }

  isActive(): boolean {
    return this.getQuantity() > 0;
  }

  getQuantity(): number {
    return this.lots.reduce((total, lot) => total + lot.quantity, 0);
  }

  getAverageBuyPrice(): number {
    return this.costBasisPolicy.calculateAverageBuyPrice(this.lots);
  }

  getCostBasis(): number {
    return this.costBasisPolicy.calculateCostBasis(this.lots);
  }

  getRealizedProfitLoss(): number {
    return this.realizedProfitLoss;
  }
}
