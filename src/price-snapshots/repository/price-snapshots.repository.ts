import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type {
  PriceSnapshot,
  PriceSnapshotWithStock,
} from '../domain/price-snapshot.entity';

@Injectable()
export class PriceSnapshotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestByStockId(stockId: number): Promise<PriceSnapshot | null> {
    return this.prisma.priceSnapshot.findFirst({
      where: { stockId },
      orderBy: { fetchedAt: 'desc' },
    });
  }

  async findLatestByTicker(
    ticker: string,
  ): Promise<PriceSnapshotWithStock | null> {
    return this.prisma.priceSnapshot.findFirst({
      where: {
        stock: { ticker },
      },
      include: { stock: true },
      orderBy: { fetchedAt: 'desc' },
    });
  }

  async findAllLatest(): Promise<PriceSnapshotWithStock[]> {
    const snapshots = await this.prisma.priceSnapshot.findMany({
      include: { stock: true },
      orderBy: { fetchedAt: 'desc' },
    });

    const latestByStockId = new Map<number, PriceSnapshotWithStock>();

    for (const snapshot of snapshots) {
      if (!latestByStockId.has(snapshot.stockId)) {
        latestByStockId.set(snapshot.stockId, snapshot);
      }
    }

    return Array.from(latestByStockId.values());
  }

  async findLastFetchedAt(): Promise<Date | null> {
    const snapshot = await this.prisma.priceSnapshot.findFirst({
      orderBy: { fetchedAt: 'desc' },
      select: { fetchedAt: true },
    });

    return snapshot?.fetchedAt ?? null;
  }
}
