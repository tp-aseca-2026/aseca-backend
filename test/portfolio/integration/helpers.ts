import { ExecutionContext, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'supertest';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';

export type TestUser = {
  id: number;
  email: string;
};

export type AuthenticatedRequest = {
  user?: TestUser;
};

export type PortfolioPositionResponseBody = {
  stockId: number;
  ticker: string;
  companyName: string | null;
  quantity: number;
  averageBuyPrice: number;
  costBasis: number;
  latestPrice: number | null;
  currentValue: number | null;
  unrealizedProfitLoss: number | null;
  unrealizedProfitLossPercentage: number | null;
  realizedProfitLoss: number;
  totalProfitLoss: number | null;
  lastPriceUpdatedAt: string | null;
};

export type PortfolioSummaryResponseBody = {
  totalCostBasis: number;
  currentValue: number | null;
  unrealizedProfitLoss: number | null;
  unrealizedProfitLossPercentage: number | null;
  realizedProfitLoss: number;
  totalProfitLoss: number | null;
  lastPriceUpdatedAt: string | null;
};

export type PortfolioResponseBody = {
  positions: PortfolioPositionResponseBody[];
  summary: PortfolioSummaryResponseBody;
};

export const TEST_USER: TestUser = { id: 1, email: 'test@example.com' };

export function bodyAs<T>(res: Response): T {
  const body = res.body as unknown;
  return body as T;
}

export async function cleanDb(prisma: PrismaService): Promise<void> {
  await prisma.watchlistItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.user.deleteMany();
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
  };
}
