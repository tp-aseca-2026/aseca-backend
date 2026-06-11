import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import { PriceSnapshotsService } from '../../../src/price-snapshots/service/price-snapshots.service';
import {
  cleanTestData,
  createStockWithPrice,
  makeGuardMock,
  setupTestUser,
  TEST_USER_EMAIL,
  TransactionResponse,
} from './helpers';

describe('POST /transactions/buy (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let priceSnapshotsService: PriceSnapshotsService;
  let testUserId: number;

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
    priceSnapshotsService = moduleRef.get(PriceSnapshotsService);
    testUserId = await setupTestUser(prisma);
  });

  afterAll(async () => {
    await cleanTestData(prisma);
    await prisma.user.deleteMany({ where: { email: TEST_USER_EMAIL } });
    await app.close();
  });

  beforeEach(async () => {
    await cleanTestData(prisma);
  });

  it('creates a BUY transaction and returns 201', async () => {
    const stock = await createStockWithPrice(prisma, 'AAPL', 150);

    const res = await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'AAPL', quantity: 5 })
      .expect(201);

    const body = res.body as TransactionResponse;

    expect(typeof body.id).toBe('number');
    expect(body.userId).toBe(testUserId);
    expect(body.stockId).toBe(stock.id);
    expect(body.type).toBe(TransactionType.BUY);
    expect(body.quantity).toBe(5);
  });

  it('persists the transaction in the database', async () => {
    await createStockWithPrice(prisma, 'MSFT', 300);

    await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'MSFT', quantity: 3 })
      .expect(201);

    const saved = await prisma.transaction.findFirst({
      where: { userId: testUserId },
    });

    expect(saved).not.toBeNull();
    if (saved === null) throw new Error('Expected transaction to be saved');
    expect(saved.type).toBe(TransactionType.BUY);
    expect(saved.quantity).toBe(3);
  });

  it('uses the latest price snapshot as the transaction price', async () => {
    const stock = await prisma.stock.create({ data: { ticker: 'TSLA' } });
    await prisma.priceSnapshot.create({
      data: {
        stockId: stock.id,
        price: 100,
        fetchedAt: new Date('2024-01-01T10:00:00Z'),
      },
    });
    await prisma.priceSnapshot.create({
      data: {
        stockId: stock.id,
        price: 250.5,
        fetchedAt: new Date('2024-06-01T10:00:00Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'TSLA', quantity: 2 })
      .expect(201);

    expect(Number((res.body as TransactionResponse).price)).toBeCloseTo(250.5);
  });

  it('returns 404 when the ticker does not exist in the stocks table', async () => {
    await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'NOTEXIST', quantity: 1 })
      .expect(404);
  });

  it('returns 404 when no price snapshot exists for the stock', async () => {
    await prisma.stock.create({ data: { ticker: 'GOOG' } });
    const runUpdateSpy = jest
      .spyOn(priceSnapshotsService, 'runUpdate')
      .mockResolvedValue({
        processed: 1,
        saved: 0,
        failed: [{ ticker: 'GOOG', error: 'No price returned' }],
        updatedAt: '2026-05-28T12:00:00.000Z',
      });

    try {
      await request(app.getHttpServer())
        .post('/transactions/buy')
        .send({ ticker: 'GOOG', quantity: 1 })
        .expect(404);
      expect(runUpdateSpy).toHaveBeenCalledWith(['GOOG']);
    } finally {
      runUpdateSpy.mockRestore();
    }
  });

  it('updates a missing price snapshot before buying', async () => {
    const stock = await prisma.stock.create({ data: { ticker: 'GOOG' } });
    const runUpdateSpy = jest
      .spyOn(priceSnapshotsService, 'runUpdate')
      .mockImplementation(async (tickers?: string[]) => {
        await prisma.priceSnapshot.create({
          data: { stockId: stock.id, price: 125.75 },
        });
        return {
          processed: tickers?.length ?? 0,
          saved: 1,
          failed: [],
          updatedAt: '2026-05-28T12:00:00.000Z',
        };
      });

    try {
      const res = await request(app.getHttpServer())
        .post('/transactions/buy')
        .send({ ticker: 'GOOG', quantity: 1 })
        .expect(201);
      expect(Number((res.body as TransactionResponse).price)).toBeCloseTo(
        125.75,
      );
      expect(runUpdateSpy).toHaveBeenCalledWith(['GOOG']);
    } finally {
      runUpdateSpy.mockRestore();
    }
  });

  it('returns 400 when quantity is zero', async () => {
    await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'AAPL', quantity: 0 })
      .expect(400);
  });

  it('returns 400 when quantity is negative', async () => {
    await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'AAPL', quantity: -5 })
      .expect(400);
  });

  it('returns 400 when quantity is a float', async () => {
    await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'AAPL', quantity: 1.5 })
      .expect(400);
  });

  it('returns 400 when ticker field is missing', async () => {
    await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ quantity: 1 })
      .expect(400);
  });

  it('returns 400 when quantity field is missing', async () => {
    await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'AAPL' })
      .expect(400);
  });
});
