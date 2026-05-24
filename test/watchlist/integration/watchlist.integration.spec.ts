import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';

const TEST_USER_EMAIL = 'watchlist-integration-user@example.com';
const OTHER_USER_EMAIL = 'watchlist-integration-other@example.com';
const TEST_TICKERS = ['WLTST', 'WLTST2'];

let testUserId: number;
let otherUserId: number;

type TestUser = {
  id: number;
  email: string;
};

type AuthenticatedRequest = {
  user?: TestUser;
};

type StockInfo = {
  id: number;
  ticker: string;
  companyName: string | null;
  cik: string | null;
  createdAt: string;
  updatedAt: string;
};

type WatchlistItemResponse = {
  id: number;
  userId: number;
  stockId: number;
  createdAt: string;
  stock: StockInfo;
};

type DeletedWatchlistItemResponse = {
  id: number;
  userId: number;
  stockId: number;
  createdAt: string;
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

async function cleanTestData(prisma: PrismaService): Promise<void> {
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

async function cleanTestUsers(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: [TEST_USER_EMAIL, OTHER_USER_EMAIL] } },
    select: { id: true },
  });
  if (users.length === 0) return;
  const ids = users.map((u) => u.id);
  await prisma.watchlistItem.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe('Watchlist (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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

    await cleanTestData(prisma);
    await cleanTestUsers(prisma);

    const user = await prisma.user.create({
      data: { email: TEST_USER_EMAIL, passwordHash: 'test-hash-not-real' },
    });
    testUserId = user.id;

    const otherUser = await prisma.user.create({
      data: { email: OTHER_USER_EMAIL, passwordHash: 'test-hash-not-real' },
    });
    otherUserId = otherUser.id;
  });

  afterAll(async () => {
    await cleanTestData(prisma);
    await cleanTestUsers(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanTestData(prisma);
  });

  describe('GET /watchlist', () => {
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

      const body = res.body as WatchlistItemResponse[];
      const item = first(body);

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

  describe('POST /watchlist', () => {
    it('returns 201 with the created watchlist item including stock info', async () => {
      await prisma.stock.create({ data: { ticker: 'WLTST' } });

      const res = await request(app.getHttpServer())
        .post('/watchlist')
        .send({ ticker: 'WLTST' })
        .expect(201);

      const body = res.body as WatchlistItemResponse;

      expect(typeof body.id).toBe('number');
      expect(body.userId).toBe(testUserId);
      expect(body.stock).toBeDefined();
      expect(body.stock.ticker).toBe('WLTST');
    });

    it('persists the watchlist item in the database', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });

      await request(app.getHttpServer())
        .post('/watchlist')
        .send({ ticker: 'WLTST' })
        .expect(201);

      const saved = await prisma.watchlistItem.findFirst({
        where: { userId: testUserId, stockId: stock.id },
      });

      expect(saved).not.toBeNull();
    });

    it('returns 409 when the stock is already in the watchlist', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });

      await prisma.watchlistItem.create({
        data: { userId: testUserId, stockId: stock.id },
      });

      await request(app.getHttpServer())
        .post('/watchlist')
        .send({ ticker: 'WLTST' })
        .expect(409);
    });

    it('does not create a duplicate record when 409 is returned', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });

      await prisma.watchlistItem.create({
        data: { userId: testUserId, stockId: stock.id },
      });

      await request(app.getHttpServer())
        .post('/watchlist')
        .send({ ticker: 'WLTST' })
        .expect(409);

      const count = await prisma.watchlistItem.count({
        where: { userId: testUserId, stockId: stock.id },
      });

      expect(count).toBe(1);
    });

    it('returns 404 when the ticker does not exist in the stocks table', async () => {
      await request(app.getHttpServer())
        .post('/watchlist')
        .send({ ticker: 'WLTST' })
        .expect(404);
    });

    it('returns 400 when ticker field is missing from the body', async () => {
      await request(app.getHttpServer())
        .post('/watchlist')
        .send({})
        .expect(400);
    });

    it('returns 400 when ticker is an empty string', async () => {
      await request(app.getHttpServer())
        .post('/watchlist')
        .send({ ticker: '' })
        .expect(400);
    });
  });

  describe('DELETE /watchlist/:ticker', () => {
    it('returns 200 with the deleted watchlist item', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });

      await prisma.watchlistItem.create({
        data: { userId: testUserId, stockId: stock.id },
      });

      const res = await request(app.getHttpServer())
        .delete('/watchlist/WLTST')
        .expect(200);

      const body = res.body as DeletedWatchlistItemResponse;

      expect(typeof body.id).toBe('number');
      expect(body.userId).toBe(testUserId);
      expect(body.stockId).toBe(stock.id);
    });

    it('removes the item from the database after deletion', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });

      await prisma.watchlistItem.create({
        data: { userId: testUserId, stockId: stock.id },
      });

      await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(200);

      const remaining = await prisma.watchlistItem.findFirst({
        where: { userId: testUserId, stockId: stock.id },
      });

      expect(remaining).toBeNull();
    });

    it('returns 404 when the ticker does not exist in the stocks table', async () => {
      await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(404);
    });

    it('returns 404 when the stock exists but is not in the user watchlist', async () => {
      await prisma.stock.create({ data: { ticker: 'WLTST' } });

      await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(404);
    });

    it('does not remove a watchlist item belonging to another user', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });

      await prisma.watchlistItem.create({
        data: { userId: otherUserId, stockId: stock.id },
      });

      await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(404);

      const surviving = await prisma.watchlistItem.findFirst({
        where: { userId: otherUserId, stockId: stock.id },
      });

      expect(surviving).not.toBeNull();
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

    it('GET /watchlist returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer()).get('/watchlist').expect(401);
    });

    it('POST /watchlist returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer())
        .post('/watchlist')
        .send({ ticker: 'WLTST' })
        .expect(401);
    });

    it('DELETE /watchlist/:ticker returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer())
        .delete('/watchlist/WLTST')
        .expect(401);
    });
  });
});
