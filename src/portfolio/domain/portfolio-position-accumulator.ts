import { TransactionType } from '@prisma/client';

export type TransactionWithStock = {
  stockId: number;
  quantity: number;
  price: { toNumber(): number };
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

  constructor(transaction: TransactionWithStock) {
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
    if (this.totalBoughtQuantity === 0) {
      return 0;
    }

    return this.totalBuyCost / this.totalBoughtQuantity;
  }

  getCostBasis(): number {
    return this.getAverageBuyPrice() * this.quantity;
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
