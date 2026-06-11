import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import type { Stock } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import { PriceSnapshotsService } from '../../../src/price-snapshots/service/price-snapshots.service';

const TEST_USER_EMAIL = 'transactions-integration-test@example.com';

let testUserId: number;

type TestUser = {
  id: number;
  email: string;
};

type AuthenticatedRequest = {
  user?: TestUser;
};

type TransactionResponse = {
  id: number;
  userId: number;
  stockId: number;
  type: TransactionType;
  quantity: number;
  price: number | string;
  executedAt: string;
};

type ErrorResponse = {
  message: string | string[];
};

const first = <T>(items: T[]): T => {
  const item = items[0];

  if (item === undefined) {
    throw new Error('Expected array to contain at least one item');
  }

  return item;
};

const itemAt = <T>(items: T[], index: number): T => {
  const item = items[index];

  if (item === undefined) {
    throw new Error(`Expected array to contain an item at index ${index}`);
  }

  return item;
};

const guardMock = {
  canActivate: (ctx: ExecutionContext): boolean => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    req.user = { id: testUserId, email: TEST_USER_EMAIL };

    return true;
  },
};

async function createStockWithPrice(
  prisma: PrismaService,
  ticker: string,
  price: number,
): Promise<Stock> {
  const stock = await prisma.stock.create({ data: { ticker } });

  await prisma.priceSnapshot.create({ data: { stockId: stock.id, price } });

  return stock;
}

const AUX_USER_EMAILS = [
  'other-user-txtest@example.com',
  'other-user-history-txtest@example.com',
];

async function cleanTestData(prisma: PrismaService): Promise<void> {
  await prisma.watchlistItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.user.deleteMany({ where: { email: { in: AUX_USER_EMAILS } } });
}

describe('Transactions (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let priceSnapshotsService: PriceSnapshotsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(guardMock)
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

    testUserId = user.id;
  });

  afterAll(async () => {
    await cleanTestData(prisma);
    await prisma.user.deleteMany({ where: { email: TEST_USER_EMAIL } });
    await app.close();
  });

  beforeEach(async () => {
    await cleanTestData(prisma);
  });

  describe('POST /transactions/buy', () => {
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

      if (saved === null) {
        throw new Error('Expected transaction to be saved');
      }

      expect(saved.type).toBe(TransactionType.BUY);
      expect(saved.quantity).toBe(3);
    });

    it('uses the latest price snapshot as the transaction price', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'TSLA' } });

      await prisma.priceSnapshot.create({
        data: { stockId: stock.id, price: 100 },
      });

      await prisma.priceSnapshot.create({
        data: { stockId: stock.id, price: 250.5 },
      });

      const res = await request(app.getHttpServer())
        .post('/transactions/buy')
        .send({ ticker: 'TSLA', quantity: 2 })
        .expect(201);

      const body = res.body as TransactionResponse;

      expect(Number(body.price)).toBeCloseTo(250.5);
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

        const body = res.body as TransactionResponse;

        expect(Number(body.price)).toBeCloseTo(125.75);
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

  describe('POST /transactions/sell', () => {
    it('creates a SELL transaction when the user holds sufficient shares', async () => {
      const stock = await createStockWithPrice(prisma, 'AAPL', 150);

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 10,
          price: 150,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AAPL', quantity: 4 })
        .expect(201);

      const body = res.body as TransactionResponse;

      expect(body.type).toBe(TransactionType.SELL);
      expect(body.quantity).toBe(4);
      expect(body.userId).toBe(testUserId);
    });

    it('persists the SELL transaction in the database', async () => {
      const stock = await createStockWithPrice(prisma, 'NVDA', 500);

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 5,
          price: 500,
        },
      });

      await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'NVDA', quantity: 2 })
        .expect(201);

      const sells = await prisma.transaction.findMany({
        where: { userId: testUserId, type: TransactionType.SELL },
      });

      const sell = first(sells);

      expect(sells).toHaveLength(1);
      expect(sell.quantity).toBe(2);
    });

    it('allows selling exactly the full position', async () => {
      const stock = await createStockWithPrice(prisma, 'AMZN', 200);

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 3,
          price: 200,
        },
      });

      await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AMZN', quantity: 3 })
        .expect(201);
    });

    it('returns 400 when selling more shares than available', async () => {
      const stock = await createStockWithPrice(prisma, 'AAPL', 150);

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 3,
          price: 150,
        },
      });

      await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AAPL', quantity: 5 })
        .expect(400);
    });

    it('includes the available share count in the error message', async () => {
      const stock = await createStockWithPrice(prisma, 'AAPL', 150);

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 3,
          price: 150,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AAPL', quantity: 5 })
        .expect(400);

      const body = res.body as ErrorResponse;
      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message;

      expect(message).toMatch(/3/);
    });

    it('returns 400 when the user has no position in the stock', async () => {
      await createStockWithPrice(prisma, 'AAPL', 150);

      await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AAPL', quantity: 1 })
        .expect(400);
    });

    it('returns 404 when the ticker does not exist', async () => {
      await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'NOTEXIST', quantity: 1 })
        .expect(404);
    });

    it('returns 400 when quantity is zero', async () => {
      await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AAPL', quantity: 0 })
        .expect(400);
    });

    it('returns 400 when quantity is a float', async () => {
      await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AAPL', quantity: 2.5 })
        .expect(400);
    });

    it("isolates position by user: does not count another user's BUYs", async () => {
      const stock = await createStockWithPrice(prisma, 'AAPL', 150);

      const otherUser = await prisma.user.create({
        data: { email: 'other-user-txtest@example.com', passwordHash: 'x' },
      });

      await prisma.transaction.create({
        data: {
          userId: otherUser.id,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 10,
          price: 150,
        },
      });

      await request(app.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AAPL', quantity: 1 })
        .expect(400);

      await prisma.transaction.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('GET /transactions', () => {
    it('returns an empty array when the user has no transactions', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions')
        .expect(200);
      const body = res.body as TransactionResponse[];

      expect(body).toEqual([]);
    });

    it('returns all transactions for the authenticated user', async () => {
      const stock = await createStockWithPrice(prisma, 'AAPL', 150);

      await prisma.transaction.createMany({
        data: [
          {
            userId: testUserId,
            stockId: stock.id,
            type: TransactionType.BUY,
            quantity: 5,
            price: 150,
          },
          {
            userId: testUserId,
            stockId: stock.id,
            type: TransactionType.BUY,
            quantity: 3,
            price: 160,
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/transactions')
        .expect(200);
      const body = res.body as TransactionResponse[];

      expect(body).toHaveLength(2);
      expect(body.every((tx) => tx.userId === testUserId)).toBe(true);
    });

    it('does not return transactions belonging to other users', async () => {
      const stock = await createStockWithPrice(prisma, 'AAPL', 150);

      const otherUser = await prisma.user.create({
        data: {
          email: 'other-user-history-txtest@example.com',
          passwordHash: 'x',
        },
      });

      await prisma.transaction.create({
        data: {
          userId: otherUser.id,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 10,
          price: 150,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/transactions')
        .expect(200);
      const body = res.body as TransactionResponse[];

      expect(body.every((tx) => tx.userId !== otherUser.id)).toBe(true);

      await prisma.transaction.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it('returns transactions ordered by executedAt descending', async () => {
      const stock = await createStockWithPrice(prisma, 'AAPL', 150);
      const earlier = new Date('2024-01-01T10:00:00Z');
      const later = new Date('2024-06-01T10:00:00Z');

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 1,
          price: 150,
          executedAt: earlier,
        },
      });

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 2,
          price: 155,
          executedAt: later,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/transactions')
        .expect(200);
      const body = res.body as TransactionResponse[];

      const firstTransaction = itemAt(body, 0);
      const secondTransaction = itemAt(body, 1);

      expect(
        new Date(firstTransaction.executedAt) >=
          new Date(secondTransaction.executedAt),
      ).toBe(true);
    });

    it('returns transactions with the expected response shape', async () => {
      const stock = await createStockWithPrice(prisma, 'AAPL', 150);

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 1,
          price: 150,
        },
      });

      const res = await request(app.getHttpServer())
        .get('/transactions')
        .expect(200);
      const body = res.body as TransactionResponse[];
      const transaction = first(body);

      expect(typeof transaction.id).toBe('number');
      expect(transaction.userId).toBe(testUserId);
      expect(transaction.stockId).toBe(stock.id);
      expect(transaction.type).toBe(TransactionType.BUY);
      expect(transaction.quantity).toBe(1);
      expect(typeof transaction.executedAt).toBe('string');
    });
  });

  describe('auth protection', () => {
    let unauthApp: INestApplication<App>;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      unauthApp = moduleRef.createNestApplication();

      unauthApp.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );

      await unauthApp.init();
    });

    afterAll(async () => {
      await unauthApp.close();
    });

    it('POST /transactions/buy returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer())
        .post('/transactions/buy')
        .send({ ticker: 'AAPL', quantity: 1 })
        .expect(401);
    });

    it('POST /transactions/sell returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer())
        .post('/transactions/sell')
        .send({ ticker: 'AAPL', quantity: 1 })
        .expect(401);
    });

    it('GET /transactions returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer()).get('/transactions').expect(401);
    });
  });
});
