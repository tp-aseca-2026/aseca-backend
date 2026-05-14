import type { Prisma } from '@prisma/client';
import type { Stock } from '../../stocks/domain/stock.entity';

export type PriceSnapshot = {
  id: number;
  stockId: number;
  price: Prisma.Decimal;
  source: string;
  fetchedAt: Date;
};

export type PriceSnapshotWithStock = PriceSnapshot & {
  stock: Stock;
};
