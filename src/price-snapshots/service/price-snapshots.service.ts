import { Injectable, NotFoundException } from '@nestjs/common';
import { PriceSnapshotsRepository } from '../repository/price-snapshots.repository';

@Injectable()
export class PriceSnapshotsService {
  constructor(
    private readonly priceSnapshotsRepository: PriceSnapshotsRepository,
  ) {}

  async getLatestSnapshots() {
    const [snapshots, lastUpdatedAt] = await Promise.all([
      this.priceSnapshotsRepository.findAllLatest(),
      this.priceSnapshotsRepository.findLastFetchedAt(),
    ]);

    return {
      lastUpdatedAt,
      prices: snapshots.map((snapshot) => ({
        ticker: snapshot.stock.ticker,
        stockId: snapshot.stockId,
        price: snapshot.price,
        source: snapshot.source,
        fetchedAt: snapshot.fetchedAt,
      })),
    };
  }

  async getLatestSnapshotByTicker(ticker: string) {
    const normalizedTicker = this.normalizeTicker(ticker);
    const snapshot =
      await this.priceSnapshotsRepository.findLatestByTicker(normalizedTicker);

    if (!snapshot) {
      throw new NotFoundException(
        `No price snapshot found for ticker ${normalizedTicker}`,
      );
    }

    return {
      ticker: snapshot.stock.ticker,
      stockId: snapshot.stockId,
      price: snapshot.price,
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
    };
  }

  async getLatestPriceForStock(stockId: number, ticker: string): Promise<number> {
    const snapshot = await this.priceSnapshotsRepository.findLatestByStockId(
      stockId,
    );

    if (!snapshot) {
      throw new NotFoundException(
        `No persisted market price found for ticker ${ticker}. Run the price snapshot update first.`,
      );
    }

    return snapshot.price.toNumber();
  }

  private normalizeTicker(ticker: string): string {
    return ticker.trim().toUpperCase();
  }
}
