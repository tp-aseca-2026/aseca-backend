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

@Injectable()
export class WatchlistService {
  constructor(
    private readonly watchlistRepository: WatchlistRepository,
    private readonly stocksService: StocksService,
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
}
