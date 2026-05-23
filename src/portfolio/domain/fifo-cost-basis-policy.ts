import { TransactionType } from '@prisma/client';
import type { CostBasisPolicy, SellResult } from './cost-basis-policy';
import type { PositionLot } from './position-lot.type';
import { TransactionWithStock } from '../../transactions/domain/transaction.entity';
import { InsufficientSharesError } from './insufficient-shares.error';

export class FifoCostBasisPolicy implements CostBasisPolicy {
  applyBuy(lots: PositionLot[], transaction: TransactionWithStock): void {
    const price = transaction.price.toNumber();

    lots.push({
      quantity: transaction.quantity,
      unitCost: price,
      acquiredAt: transaction.executedAt,
    });
  }

  applySell(
    lots: PositionLot[],
    transaction: TransactionWithStock,
  ): SellResult {
    if (transaction.type !== TransactionType.SELL) {
      return { realizedProfitLoss: 0 };
    }

    let remainingToSell = transaction.quantity;
    let realizedProfitLoss = 0;
    const sellPrice = transaction.price.toNumber();

    while (remainingToSell > 0) {
      const oldestLot = lots[0];

      if (!oldestLot) {
        throw new InsufficientSharesError();
      }

      const quantityTaken = Math.min(oldestLot.quantity, remainingToSell);

      realizedProfitLoss += quantityTaken * (sellPrice - oldestLot.unitCost);

      oldestLot.quantity -= quantityTaken;
      remainingToSell -= quantityTaken;

      if (oldestLot.quantity === 0) {
        lots.shift();
      }
    }

    return { realizedProfitLoss };
  }

  calculateCostBasis(lots: PositionLot[]): number {
    return lots.reduce((total, lot) => total + lot.quantity * lot.unitCost, 0);
  }

  calculateAverageBuyPrice(lots: PositionLot[]): number {
    const totalQuantity = lots.reduce((total, lot) => total + lot.quantity, 0);

    if (totalQuantity === 0) {
      return 0;
    }

    return this.calculateCostBasis(lots) / totalQuantity;
  }
}
