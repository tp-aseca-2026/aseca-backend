import type { PositionLot } from './position-lot.type';
import { TransactionWithStock } from '../../transactions/domain/transaction.entity';

export type SellResult = {
  realizedProfitLoss: number;
};

export interface CostBasisPolicy {
  applyBuy(lots: PositionLot[], transaction: TransactionWithStock): void;

  applySell(lots: PositionLot[], transaction: TransactionWithStock): SellResult;

  calculateCostBasis(lots: PositionLot[]): number;

  calculateAverageBuyPrice(lots: PositionLot[]): number;
}
