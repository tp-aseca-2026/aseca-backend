import { Inject, Injectable } from '@nestjs/common';

import { PriceSnapshotsRepository } from '../../price-snapshots/repository/price-snapshots.repository';
import { TransactionsRepository } from '../../transactions/repository/transactions.repository';
import type { TransactionWithStock } from '../../transactions/domain/transaction.entity';
import { COST_BASIS_POLICY } from '../domain/cost-basis-policy.token';
import type { CostBasisPolicy } from '../domain/cost-basis-policy';
import { PortfolioCalculator } from '../domain/portfolio-calculator';
import { MISSING_PRICE_POLICY } from '../domain/missing-price-policy.token';
import type { MissingPricePolicy } from '../domain/missing-price-policy';
import { PortfolioPositionAccumulator } from '../domain/portfolio-position-accumulator';
import {
  PortfolioPosition,
  PortfolioResponse,
} from '../ types/portfolio-position.type';

type PositionValuation = {
  currentValue: number;
  costBasis: number;
  unrealizedProfitLoss: number;
  unrealizedProfitLossPercentage: number;
  realizedProfitLoss: number;
  totalProfitLoss: number;
};

@Injectable()
export class PortfolioService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly priceSnapshotsRepository: PriceSnapshotsRepository,
    private readonly portfolioCalculator: PortfolioCalculator,
    @Inject(MISSING_PRICE_POLICY)
    private readonly missingPricePolicy: MissingPricePolicy,
    @Inject(COST_BASIS_POLICY)
    private readonly costBasisPolicy: CostBasisPolicy,
  ) {}

  async getPortfolio(userId: number): Promise<PortfolioResponse> {
    const transactions =
      await this.transactionsRepository.findByUserIdWithStock(userId);

    const activePositions = this.buildActivePositions(transactions);
    const positions = await this.valuePositions(activePositions);

    return {
      positions,
      summary: this.portfolioCalculator.buildSummary(positions),
    };
  }

  private buildActivePositions(
    transactions: TransactionWithStock[],
  ): PortfolioPositionAccumulator[] {
    const positions = new Map<number, PortfolioPositionAccumulator>();

    for (const transaction of transactions) {
      this.applyTransactionToPosition(positions, transaction);
    }

    return this.getActivePositions(positions);
  }

  private applyTransactionToPosition(
    positions: Map<number, PortfolioPositionAccumulator>,
    transaction: TransactionWithStock,
  ): void {
    const position = this.getOrCreatePosition(positions, transaction);
    position.apply(transaction);
  }

  private getOrCreatePosition(
    positions: Map<number, PortfolioPositionAccumulator>,
    transaction: TransactionWithStock,
  ): PortfolioPositionAccumulator {
    const existingPosition = positions.get(transaction.stockId);

    if (existingPosition) {
      return existingPosition;
    }

    const newPosition = new PortfolioPositionAccumulator(
      transaction,
      this.costBasisPolicy,
    );

    positions.set(transaction.stockId, newPosition);

    return newPosition;
  }

  private getActivePositions(
    positions: Map<number, PortfolioPositionAccumulator>,
  ): PortfolioPositionAccumulator[] {
    return Array.from(positions.values()).filter((position) =>
      position.isActive(),
    );
  }

  private async valuePositions(
    positions: PortfolioPositionAccumulator[],
  ): Promise<PortfolioPosition[]> {
    return Promise.all(
      positions.map((position) => this.valuePosition(position)),
    );
  }

  private async valuePosition(
    position: PortfolioPositionAccumulator,
  ): Promise<PortfolioPosition> {
    const latestSnapshot =
      await this.priceSnapshotsRepository.findLatestByStockId(position.stockId);

    if (!latestSnapshot) {
      return this.missingPricePolicy.buildPositionWithoutPrice(position);
    }

    return this.buildPositionWithMarketPrice(
      position,
      latestSnapshot.price.toNumber(),
      latestSnapshot.fetchedAt,
    );
  }

  private buildPositionWithMarketPrice(
    position: PortfolioPositionAccumulator,
    latestPrice: number,
    lastPriceUpdatedAt: Date,
  ): PortfolioPosition {
    const valuation = this.calculatePositionValuation(position, latestPrice);

    return {
      stockId: position.stockId,
      ticker: position.ticker,
      companyName: position.companyName,
      quantity: position.getQuantity(),
      averageBuyPrice: this.roundMoney(position.getAverageBuyPrice()),
      costBasis: this.roundMoney(valuation.costBasis),
      latestPrice: this.roundMoney(latestPrice),
      currentValue: this.roundMoney(valuation.currentValue),
      unrealizedProfitLoss: this.roundMoney(valuation.unrealizedProfitLoss),
      unrealizedProfitLossPercentage: valuation.unrealizedProfitLossPercentage,
      realizedProfitLoss: this.roundMoney(valuation.realizedProfitLoss),
      totalProfitLoss: this.roundMoney(valuation.totalProfitLoss),
      lastPriceUpdatedAt,
    };
  }

  private calculatePositionValuation(
    position: PortfolioPositionAccumulator,
    latestPrice: number,
  ): PositionValuation {
    const quantity = position.getQuantity();
    const costBasis = position.getCostBasis();
    const currentValue = latestPrice * quantity;
    const unrealizedProfitLoss = currentValue - costBasis;
    const realizedProfitLoss = position.getRealizedProfitLoss();

    return {
      currentValue,
      costBasis,
      unrealizedProfitLoss,
      unrealizedProfitLossPercentage:
        this.portfolioCalculator.calculatePercentage(
          unrealizedProfitLoss,
          costBasis,
        ),
      realizedProfitLoss,
      totalProfitLoss: realizedProfitLoss + unrealizedProfitLoss,
    };
  }

  private roundMoney(value: number): number {
    return this.portfolioCalculator.roundMoney(value);
  }
}
