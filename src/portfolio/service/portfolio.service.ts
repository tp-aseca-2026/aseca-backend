import { Injectable } from '@nestjs/common';
import { PriceSnapshotsRepository } from '../../price-snapshots/repository/price-snapshots.repository';
import { TransactionsRepository } from '../../transactions/repository/transactions.repository';
import { PortfolioCalculator } from '../domain/portfolio-calculator';
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
      summary: PortfolioCalculator.buildSummary(positions),
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

    const newPosition = new PortfolioPositionAccumulator(transaction);
    positions.set(transaction.stockId, newPosition);

    return newPosition;
  }

  private async valuePosition(
    position: PortfolioPositionAccumulator,
  ): Promise<PortfolioPosition> {
    const latestSnapshot =
      await this.priceSnapshotsRepository.findLatestByStockId(position.stockId);

    if (!latestSnapshot) {
      return this.buildPositionWithoutMarketPrice(position);
    }

    const latestPrice = latestSnapshot.price.toNumber();
    const currentValue = latestPrice * position.getQuantity();
    const profitLoss = currentValue - position.getCostBasis();

    return {
      stockId: position.stockId,
      ticker: position.ticker,
      companyName: position.companyName,
      quantity: position.getQuantity(),
      averageBuyPrice: PortfolioCalculator.roundMoney(
        position.getAverageBuyPrice(),
      ),
      costBasis: PortfolioCalculator.roundMoney(position.getCostBasis()),
      latestPrice: PortfolioCalculator.roundMoney(latestPrice),
      currentValue: PortfolioCalculator.roundMoney(currentValue),
      profitLoss: PortfolioCalculator.roundMoney(profitLoss),
      profitLossPercentage: PortfolioCalculator.calculatePercentage(
        profitLoss,
        position.getCostBasis(),
      ),
      lastPriceUpdatedAt: latestSnapshot.fetchedAt,
    };
  }

  private buildPositionWithoutMarketPrice(
    position: PortfolioPositionAccumulator,
  ): PortfolioPosition {
    return {
      stockId: position.stockId,
      ticker: position.ticker,
      companyName: position.companyName,
      quantity: position.getQuantity(),
      averageBuyPrice: PortfolioCalculator.roundMoney(
        position.getAverageBuyPrice(),
      ),
      costBasis: PortfolioCalculator.roundMoney(position.getCostBasis()),
      latestPrice: null,
      currentValue: null,
      profitLoss: null,
      profitLossPercentage: null,
      lastPriceUpdatedAt: null,
    };
  }
}
