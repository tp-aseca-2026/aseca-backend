import type { Stock } from '../../stocks/domain/stock.entity';

export type WatchlistItem = {
  id: number;
  userId: number;
  stockId: number;
  createdAt: Date;
};

export type WatchlistItemWithStock = WatchlistItem & {
  stock: Stock;
};
