import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  cleanTestData,
  cleanTestUsers,
  first,
  itemAt,
  makeGuardMock,
  setupTestUsers,
  WatchlistItemResponse,
} from './helpers';

describe('GET /watchlist (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let testUserId: number;
  let otherUserId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(makeGuardMock(() => testUserId))
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
    ({ testUserId, otherUserId } = await setupTestUsers(prisma));
  });

  afterAll(async () => {
    await cleanTestData(prisma);
    await cleanTestUsers(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanTestData(prisma);
  });

  it('returns an empty array when the user has no watchlist items', async () => {
    const res = await request(app.getHttpServer())
      .get('/watchlist')
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('returns all watchlist items for the authenticated user', async () => {
    const stock1 = await prisma.stock.create({ data: { ticker: 'WLTST' } });
    const stock2 = await prisma.stock.create({ data: { ticker: 'WLTST2' } });

    await prisma.watchlistItem.createMany({
      data: [
        { userId: testUserId, stockId: stock1.id },
        { userId: testUserId, stockId: stock2.id },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/watchlist')
      .expect(200);
    const body = res.body as WatchlistItemResponse[];

    expect(body).toHaveLength(2);
    expect(body.every((item) => item.userId === testUserId)).toBe(true);
  });

  it('includes stock info in each watchlist item', async () => {
    const stock = await prisma.stock.create({
      data: { ticker: 'WLTST', companyName: 'Watchlist Test Corp' },
    });
    await prisma.watchlistItem.create({
      data: { userId: testUserId, stockId: stock.id },
    });

    const res = await request(app.getHttpServer())
      .get('/watchlist')
      .expect(200);
    const item = first(res.body as WatchlistItemResponse[]);

    expect(typeof item.id).toBe('number');
    expect(item.userId).toBe(testUserId);
    expect(item.stockId).toBe(stock.id);
    expect(item.stock).toBeDefined();
    expect(item.stock.ticker).toBe('WLTST');
    expect(item.stock.companyName).toBe('Watchlist Test Corp');
  });

  it('returns items ordered by createdAt descending', async () => {
    const stock1 = await prisma.stock.create({ data: { ticker: 'WLTST' } });
    const stock2 = await prisma.stock.create({ data: { ticker: 'WLTST2' } });

    await prisma.watchlistItem.create({
      data: {
        userId: testUserId,
        stockId: stock1.id,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      },
    });
    await prisma.watchlistItem.create({
      data: {
        userId: testUserId,
        stockId: stock2.id,
        createdAt: new Date('2024-06-01T10:00:00Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .get('/watchlist')
      .expect(200);
    const body = res.body as WatchlistItemResponse[];

    expect(body).toHaveLength(2);
    expect(
      new Date(itemAt(body, 0).createdAt) >=
        new Date(itemAt(body, 1).createdAt),
    ).toBe(true);
  });

  it('does not return watchlist items belonging to other users', async () => {
    const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });
    await prisma.watchlistItem.create({
      data: { userId: otherUserId, stockId: stock.id },
    });

    const res = await request(app.getHttpServer())
      .get('/watchlist')
      .expect(200);
    const body = res.body as WatchlistItemResponse[];

    expect(body.every((item) => item.userId === testUserId)).toBe(true);
    expect(body.some((item) => item.userId === otherUserId)).toBe(false);
  });
});
