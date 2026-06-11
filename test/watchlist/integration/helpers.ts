import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../../src/database/prisma.service';

export const TEST_USER_EMAIL = 'watchlist-integration-user@example.com';
export const OTHER_USER_EMAIL = 'watchlist-integration-other@example.com';
export const TEST_TICKERS = ['WLTST', 'WLTST2'];

export type TestUser = {
  id: number;
  email: string;
};

export type AuthenticatedRequest = {
  user?: TestUser;
};

export type StockInfo = {
  id: number;
  ticker: string;
  companyName: string | null;
  cik: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WatchlistItemResponse = {
  id: number;
  userId: number;
  stockId: number;
  createdAt: string;
  stock: StockInfo;
};

export type DeletedWatchlistItemResponse = {
  id: number;
  userId: number;
  stockId: number;
  createdAt: string;
};

export const first = <T>(items: T[]): T => {
  const item = items[0];
  if (item === undefined)
    throw new Error('Expected array to contain at least one item');
  return item;
};

export const itemAt = <T>(items: T[], index: number): T => {
  const item = items[index];
  if (item === undefined)
    throw new Error(`Expected array to contain an item at index ${index}`);
  return item;
};

export function makeGuardMock(getUserId: () => number) {
  return {
    canActivate: (ctx: ExecutionContext): boolean => {
      const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
      req.user = { id: getUserId(), email: TEST_USER_EMAIL };
      return true;
    },
  };
}

export async function cleanTestData(prisma: PrismaService): Promise<void> {
  const stocks = await prisma.stock.findMany({
    where: { ticker: { in: TEST_TICKERS } },
    select: { id: true },
  });
  const stockIds = stocks.map((s) => s.id);
  if (stockIds.length === 0) return;

  await prisma.watchlistItem.deleteMany({
    where: { stockId: { in: stockIds } },
  });
  await prisma.priceSnapshot.deleteMany({
    where: { stockId: { in: stockIds } },
  });
  await prisma.stock.deleteMany({ where: { id: { in: stockIds } } });
}

export async function cleanTestUsers(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: [TEST_USER_EMAIL, OTHER_USER_EMAIL] } },
    select: { id: true },
  });
  if (users.length === 0) return;
  const ids = users.map((u) => u.id);
  await prisma.watchlistItem.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export async function setupTestUsers(
  prisma: PrismaService,
): Promise<{ testUserId: number; otherUserId: number }> {
  await cleanTestData(prisma);
  await cleanTestUsers(prisma);

  const user = await prisma.user.create({
    data: { email: TEST_USER_EMAIL, passwordHash: 'test-hash-not-real' },
  });
  const otherUser = await prisma.user.create({
    data: { email: OTHER_USER_EMAIL, passwordHash: 'test-hash-not-real' },
  });

  return { testUserId: user.id, otherUserId: otherUser.id };
}
