import { Inject, Injectable } from '@nestjs/common';
import { PriceSnapshotsRepository } from '../../price-snapshots/repository/price-snapshots.repository';
import { TransactionsRepository } from '../../transactions/repository/transactions.repository';
import { COST_BASIS_POLICY } from '../domain/cost-basis-policy.token';
import type { CostBasisPolicy } from '../domain/cost-basis-policy';
import { PortfolioCalculator } from '../domain/portfolio-calculator';
import { MISSING_PRICE_POLICY } from '../domain/missing-price-policy.token';
import type { MissingPricePolicy } from '../domain/missing-price-policy';
import {
  PortfolioPositionAccumulator,
  TransactionWithStock,
} from '../domain/portfolio-position-accumulator';
import {
  PortfolioPosition,
  PortfolioResponse,
} from '../ types/portfolio-position.type';

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

    const positions = await Promise.all(
      activePositions.map((position) => this.valuePosition(position)),
    );

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
      const position = this.getOrCreatePosition(positions, transaction);
      position.apply(transaction);
    }

    return Array.from(positions.values()).filter((position) =>
      position.isActive(),
    );
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
    const currentValue = latestPrice * position.getQuantity();
    const profitLoss = currentValue - position.getCostBasis();

    return {
      stockId: position.stockId,
      ticker: position.ticker,
      companyName: position.companyName,
      quantity: position.getQuantity(),
      averageBuyPrice: this.portfolioCalculator.roundMoney(
        position.getAverageBuyPrice(),
      ),
      costBasis: this.portfolioCalculator.roundMoney(position.getCostBasis()),
      latestPrice: this.portfolioCalculator.roundMoney(latestPrice),
      currentValue: this.portfolioCalculator.roundMoney(currentValue),
      profitLoss: this.portfolioCalculator.roundMoney(profitLoss),
      profitLossPercentage: this.portfolioCalculator.calculatePercentage(
        profitLoss,
        position.getCostBasis(),
      ),
      lastPriceUpdatedAt,
    };
  }
}
