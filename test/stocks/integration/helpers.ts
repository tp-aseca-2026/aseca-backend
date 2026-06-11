import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
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

export type StockResponse = {
  id: number;
  ticker: string;
  companyName: string | null;
  cik: string | null;
};

export const TEST_USER: TestUser = { id: 1, email: 'test@example.com' };

export async function buildApp(
  overrideGuard: boolean,
): Promise<INestApplication<App>> {
  let builder = Test.createTestingModule({ imports: [AppModule] });

  if (overrideGuard) {
    builder = builder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: (ctx: ExecutionContext): boolean => {
        const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
        req.user = TEST_USER;
        return true;
      },
    });
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

export async function cleanDb(prisma: PrismaService): Promise<void> {
  await prisma.watchlistItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.stock.deleteMany();
}
