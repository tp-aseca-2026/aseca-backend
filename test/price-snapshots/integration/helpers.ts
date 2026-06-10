import { ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'supertest';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import { PriceSnapshotsService } from '../../../src/price-snapshots/service/price-snapshots.service';

export type TestUser = {
  id: number;
  email: string;
};

export type AuthenticatedRequest = {
  user?: TestUser;
};

export type PriceSnapshotResponseBody = {
  ticker: string;
  stockId: number;
  source: string;
  fetchedAt: string;
  price: string | number;
};

export type LatestPriceSnapshotsResponseBody = {
  lastUpdatedAt: string | null;
  prices: PriceSnapshotResponseBody[];
};

export type UpdatePriceSnapshotsResponseBody = {
  processed: number;
  saved: number;
  failed: unknown[];
  updatedAt?: string;
};

export type RunUpdateResult = Awaited<
  ReturnType<PriceSnapshotsService['runUpdate']>
>;

export const TEST_USER: TestUser = { id: 1, email: 'test@example.com' };

export const MOCK_UPDATE_RESULT: RunUpdateResult = {
  processed: 2,
  saved: 2,
  failed: [],
  updatedAt: '2026-05-22T10:00:00.000Z',
};

export function bodyAs<T>(res: Response): T {
  const body = res.body as unknown;
  return body as T;
}

export async function cleanDb(prisma: PrismaService): Promise<void> {
  await prisma.watchlistItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.stock.deleteMany();
}

export async function buildAuthApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
        req.user = TEST_USER;
        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  return {
    app,
    prisma: moduleRef.get(PrismaService),
    priceSnapshotsService: moduleRef.get(PriceSnapshotsService),
  };
}
