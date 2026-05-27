import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StocksService } from '../../stocks/service/stocks.service';
import type {
  WatchlistItem,
  WatchlistItemWithStock,
} from '../domain/watchlist-item.entity';
import { WatchlistRepository } from '../repository/watchlist.repository';
import { EdgarService } from '../../edgar/service/edgar.service';

@Injectable()
export class WatchlistService {
  constructor(
    private readonly watchlistRepository: WatchlistRepository,
    private readonly stocksService: StocksService,
    private readonly edgarService: EdgarService,
  ) {}

  async getWatchlist(userId: number): Promise<WatchlistItemWithStock[]> {
    return this.watchlistRepository.findByUserId(userId);
  }

  async add(userId: number, ticker: string): Promise<WatchlistItemWithStock> {
    const stock = await this.stocksService.findByTicker(ticker);
    const existing = await this.watchlistRepository.findByUserIdAndStockId(
      userId,
      stock.id,
    );

    if (existing) {
      throw new ConflictException(
        `Stock with ticker ${stock.ticker} is already in your watchlist`,
      );
    }

    return this.watchlistRepository.create(userId, stock.id);
  }

  async remove(userId: number, ticker: string): Promise<WatchlistItem> {
    const stock = await this.stocksService.findByTicker(ticker);
    const existing = await this.watchlistRepository.findByUserIdAndStockId(
      userId,
      stock.id,
    );

    if (!existing) {
      throw new NotFoundException(
        `Stock with ticker ${stock.ticker} is not in your watchlist`,
      );
    }

    return this.watchlistRepository.deleteById(existing.id);
  }

  async getComparison(userId: number) {
    const items = await this.watchlistRepository.findByUserId(userId);

    return Promise.all(
      items.map(async (item) => {
        const metrics = await this.edgarService.getMetrics(item.stock.ticker);

        return {
          ticker: item.stock.ticker,
          companyName: item.stock.companyName,
          revenue: metrics.revenue,
          netIncome: metrics.netIncome,
          eps: metrics.eps,
          totalAssets: metrics.totalAssets,
          totalLiabilities: metrics.totalLiabilities,
        };
      }),
    );
  }
}
