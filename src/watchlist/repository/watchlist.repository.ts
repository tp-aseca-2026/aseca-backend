import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type {
  WatchlistItem,
  WatchlistItemWithStock,
} from '../domain/watchlist-item.entity';

@Injectable()
export class WatchlistRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: number,
    stockId: number,
  ): Promise<WatchlistItemWithStock> {
    return this.prisma.watchlistItem.create({
      data: { userId, stockId },
      include: { stock: true },
    });
  }

  async findByUserId(userId: number): Promise<WatchlistItemWithStock[]> {
    return this.prisma.watchlistItem.findMany({
      where: { userId },
      include: { stock: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUserIdAndStockId(
    userId: number,
    stockId: number,
  ): Promise<WatchlistItem | null> {
    return this.prisma.watchlistItem.findUnique({
      where: { userId_stockId: { userId, stockId } },
    });
  }

  async deleteById(id: number): Promise<WatchlistItem> {
    return this.prisma.watchlistItem.delete({ where: { id } });
  }
}
