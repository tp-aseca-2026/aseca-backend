import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PriceSnapshotsRepository } from '../repository/price-snapshots.repository';

const execFileAsync = promisify(execFile);

export type PriceSnapshotUpdateResult = {
  processed: number;
  saved: number;
  failed: { ticker: string; error: string }[];
  reused: {
    ticker: string;
    stockId: number;
    price: string;
    source: string;
    fetchedAt: string;
  }[];
  updatedAt: string | null;
};

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

  async getLatestPriceForStock(
    stockId: number,
    ticker: string,
  ): Promise<number> {
    const snapshot =
      await this.priceSnapshotsRepository.findLatestByStockId(stockId);

    if (!snapshot) {
      throw new NotFoundException(
        `No persisted market price found for ticker ${ticker}. Run the price snapshot update first.`,
      );
    }

    return snapshot.price.toNumber();
  }

  async runUpdate(tickers?: string[]): Promise<PriceSnapshotUpdateResult> {
    const args = ['scripts/update_price_snapshots.py'];
    const normalizedTickers = tickers
      ?.map((ticker) => this.normalizeTicker(ticker))
      .filter(Boolean);

    if (normalizedTickers?.length) {
      args.push('--tickers', normalizedTickers.join(','));
    }

    try {
      const { stdout } = await execFileAsync(
        process.env.PRICE_SNAPSHOT_PYTHON_COMMAND ?? 'python3',
        args,
        {
          cwd: process.cwd(),
          timeout: 120_000,
          maxBuffer: 1024 * 1024,
        },
      );

      return JSON.parse(stdout.trim()) as PriceSnapshotUpdateResult;
    } catch (error) {
      throw new InternalServerErrorException(
        `Price snapshot update failed: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private normalizeTicker(ticker: string): string {
    return ticker.trim().toUpperCase();
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}
