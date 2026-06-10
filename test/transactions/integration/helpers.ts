import { ExecutionContext } from '@nestjs/common';
import type { Stock } from '@prisma/client';
import { PrismaService } from '../../../src/database/prisma.service';

export const TEST_USER_EMAIL = 'transactions-integration-test@example.com';

export const AUX_USER_EMAILS = [
  'other-user-txtest@example.com',
  'other-user-history-txtest@example.com',
];

export type TestUser = {
  id: number;
  email: string;
};

export type AuthenticatedRequest = {
  user?: TestUser;
};

export type TransactionResponse = {
  id: number;
  userId: number;
  stockId: number;
  type: string;
  quantity: number;
  price: number | string;
  executedAt: string;
};

export type ErrorResponse = {
  message: string | string[];
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

export async function createStockWithPrice(
  prisma: PrismaService,
  ticker: string,
  price: number,
): Promise<Stock> {
  const stock = await prisma.stock.create({ data: { ticker } });
  await prisma.priceSnapshot.create({ data: { stockId: stock.id, price } });
  return stock;
}

export async function cleanTestData(prisma: PrismaService): Promise<void> {
  await prisma.watchlistItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.user.deleteMany({ where: { email: { in: AUX_USER_EMAILS } } });
}

export async function setupTestUser(prisma: PrismaService): Promise<number> {
  const stale = await prisma.user.findMany({
    where: { email: TEST_USER_EMAIL },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((u) => u.id);
    await prisma.watchlistItem.deleteMany({ where: { userId: { in: ids } } });
    await prisma.transaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  const user = await prisma.user.create({
    data: { email: TEST_USER_EMAIL, passwordHash: 'test-hash-not-real' },
  });
  return user.id;
}
