import {
  ExecutionContext,
  INestApplication,
  InternalServerErrorException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import { PriceSnapshotsService } from '../../../src/price-snapshots/service/price-snapshots.service';

type TestUser = {
  id: number;
  email: string;
};

type AuthenticatedRequest = {
  user?: TestUser;
};

type PriceSnapshotResponseBody = {
  ticker: string;
  stockId: number;
  source: string;
  fetchedAt: string;
  price: string | number;
};

type LatestPriceSnapshotsResponseBody = {
  lastUpdatedAt: string | null;
  prices: PriceSnapshotResponseBody[];
};

type UpdatePriceSnapshotsResponseBody = {
  processed: number;
  saved: number;
  failed: unknown[];
  updatedAt?: string;
};

type RunUpdateResult = Awaited<ReturnType<PriceSnapshotsService['runUpdate']>>;

const TEST_USER: TestUser = { id: 1, email: 'test@example.com' };

const MOCK_UPDATE_RESULT: RunUpdateResult = {
  processed: 2,
  saved: 2,
  failed: [],
  reused: [],
  updatedAt: '2026-05-22T10:00:00.000Z',
};

function bodyAs<T>(res: Response): T {
  const body = res.body as unknown;
  return body as T;
}

async function cleanDb(prisma: PrismaService): Promise<void> {
  await prisma.watchlistItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.stock.deleteMany();
}

describe('PriceSnapshots (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let priceSnapshotsService: PriceSnapshotsService;

  beforeAll(async () => {
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
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(prisma);
  });

  describe('GET /price-snapshots/latest', () => {
    it('returns 200 with empty prices and null lastUpdatedAt when DB is empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/price-snapshots/latest')
        .expect(200);

      const body = bodyAs<LatestPriceSnapshotsResponseBody>(res);

      expect(body).toEqual({ lastUpdatedAt: null, prices: [] });
    });

    it('returns 200 with the snapshot for the existing stock', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'AAPL' } });

      await prisma.priceSnapshot.create({
        data: { stockId: stock.id, price: 180.0 },
      });

      const res = await request(app.getHttpServer())
        .get('/price-snapshots/latest')
        .expect(200);

      const body = bodyAs<LatestPriceSnapshotsResponseBody>(res);

      expect(body.prices).toHaveLength(1);

      const snapshot = body.prices[0];

      if (snapshot === undefined) {
        throw new Error('Expected one price snapshot in response');
      }

      expect(snapshot.ticker).toBe('AAPL');
      expect(snapshot.stockId).toBe(stock.id);
      expect(typeof snapshot.source).toBe('string');
      expect(typeof snapshot.fetchedAt).toBe('string');
      expect(Number(snapshot.price)).toBeCloseTo(180.0);
    });

    it('returns the most recent snapshot when a stock has multiple', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'TSLA' } });

      await prisma.priceSnapshot.create({
        data: {
          stockId: stock.id,
          price: 100.0,
          fetchedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });

      await prisma.priceSnapshot.create({
        data: {
          stockId: stock.id,
          price: 250.0,
          fetchedAt: new Date('2026-06-01T00:00:00Z'),
        },
      });

      const res = await request(app.getHttpServer())
        .get('/price-snapshots/latest')
        .expect(200);

      const body = bodyAs<LatestPriceSnapshotsResponseBody>(res);

      expect(body.prices).toHaveLength(1);

      const snapshot = body.prices[0];

      if (snapshot === undefined) {
        throw new Error('Expected one price snapshot in response');
      }

      expect(Number(snapshot.price)).toBeCloseTo(250.0);
    });

    it('returns one entry per stock, not one per snapshot', async () => {
      const aapl = await prisma.stock.create({ data: { ticker: 'AAPL' } });
      const msft = await prisma.stock.create({ data: { ticker: 'MSFT' } });

      await prisma.priceSnapshot.createMany({
        data: [
          { stockId: aapl.id, price: 170 },
          { stockId: aapl.id, price: 175 },
          { stockId: msft.id, price: 400 },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/price-snapshots/latest')
        .expect(200);

      const body = bodyAs<LatestPriceSnapshotsResponseBody>(res);

      expect(body.prices).toHaveLength(2);

      const tickers = body.prices.map((price) => price.ticker).sort();

      expect(tickers).toEqual(['AAPL', 'MSFT']);
    });

    it('lastUpdatedAt reflects the most recent fetchedAt across all stocks', async () => {
      const aapl = await prisma.stock.create({ data: { ticker: 'AAPL' } });
      const msft = await prisma.stock.create({ data: { ticker: 'MSFT' } });
      const latestTime = '2026-05-22T12:00:00.000Z';

      await prisma.priceSnapshot.create({
        data: {
          stockId: aapl.id,
          price: 170,
          fetchedAt: new Date('2026-05-01T00:00:00Z'),
        },
      });

      await prisma.priceSnapshot.create({
        data: {
          stockId: msft.id,
          price: 400,
          fetchedAt: new Date(latestTime),
        },
      });

      const res = await request(app.getHttpServer())
        .get('/price-snapshots/latest')
        .expect(200);

      const body = bodyAs<LatestPriceSnapshotsResponseBody>(res);

      if (body.lastUpdatedAt === null) {
        throw new Error('Expected lastUpdatedAt to be defined');
      }

      expect(new Date(body.lastUpdatedAt).toISOString()).toBe(latestTime);
    });
  });

  describe('GET /price-snapshots/latest/:ticker', () => {
    it('returns 200 with snapshot data for an existing ticker', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'AAPL' } });

      await prisma.priceSnapshot.create({
        data: { stockId: stock.id, price: 185.5 },
      });

      const res = await request(app.getHttpServer())
        .get('/price-snapshots/latest/AAPL')
        .expect(200);

      const body = bodyAs<PriceSnapshotResponseBody>(res);

      expect(body.ticker).toBe('AAPL');
      expect(body.stockId).toBe(stock.id);
      expect(typeof body.source).toBe('string');
      expect(typeof body.fetchedAt).toBe('string');
      expect(Number(body.price)).toBeCloseTo(185.5);
    });

    it('normalizes ticker to uppercase when querying', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'MSFT' } });

      await prisma.priceSnapshot.create({
        data: { stockId: stock.id, price: 410 },
      });

      const res = await request(app.getHttpServer())
        .get('/price-snapshots/latest/msft')
        .expect(200);

      const body = bodyAs<PriceSnapshotResponseBody>(res);

      expect(body.ticker).toBe('MSFT');
    });

    it('returns the most recent snapshot when multiple exist for the ticker', async () => {
      const stock = await prisma.stock.create({ data: { ticker: 'GOOG' } });

      await prisma.priceSnapshot.create({
        data: {
          stockId: stock.id,
          price: 100,
          fetchedAt: new Date('2026-01-01T00:00:00Z'),
        },
      });

      await prisma.priceSnapshot.create({
        data: {
          stockId: stock.id,
          price: 200,
          fetchedAt: new Date('2026-06-01T00:00:00Z'),
        },
      });

      const res = await request(app.getHttpServer())
        .get('/price-snapshots/latest/GOOG')
        .expect(200);

      const body = bodyAs<PriceSnapshotResponseBody>(res);

      expect(Number(body.price)).toBeCloseTo(200);
    });

    it('returns 404 when ticker exists in stocks but has no snapshot', async () => {
      await prisma.stock.create({ data: { ticker: 'AMZN' } });

      await request(app.getHttpServer())
        .get('/price-snapshots/latest/AMZN')
        .expect(404);
    });

    it('returns 404 when ticker does not exist at all', async () => {
      await request(app.getHttpServer())
        .get('/price-snapshots/latest/NOTEXIST')
        .expect(404);
    });
  });

  describe('POST /price-snapshots/update', () => {
    let runUpdateSpy: jest.SpiedFunction<PriceSnapshotsService['runUpdate']>;

    beforeEach(() => {
      runUpdateSpy = jest
        .spyOn(priceSnapshotsService, 'runUpdate')
        .mockResolvedValue(MOCK_UPDATE_RESULT);
    });

    afterEach(() => {
      runUpdateSpy?.mockRestore();
    });

    it('returns 201 with the update result when the script succeeds', async () => {
      const res = await request(app.getHttpServer())
        .post('/price-snapshots/update')
        .expect(201);

      const body = bodyAs<UpdatePriceSnapshotsResponseBody>(res);

      expect(typeof body.processed).toBe('number');
      expect(typeof body.saved).toBe('number');
      expect(Array.isArray(body.failed)).toBe(true);
    });

    it('calls the service without tickers when body is empty', async () => {
      await request(app.getHttpServer())
        .post('/price-snapshots/update')
        .expect(201);

      expect(runUpdateSpy).toHaveBeenCalledWith(undefined);
    });

    it('passes the tickers array to the service when provided', async () => {
      await request(app.getHttpServer())
        .post('/price-snapshots/update')
        .send({ tickers: ['AAPL', 'MSFT'] })
        .expect(201);

      expect(runUpdateSpy).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });

    it('returns 500 when the service throws InternalServerErrorException', async () => {
      runUpdateSpy.mockRejectedValue(
        new InternalServerErrorException('Price snapshot update failed'),
      );

      await request(app.getHttpServer())
        .post('/price-snapshots/update')
        .expect(500);
    });

    it('returns 400 when tickers is not an array', async () => {
      await request(app.getHttpServer())
        .post('/price-snapshots/update')
        .send({ tickers: 'AAPL' })
        .expect(400);
    });

    it('returns 400 when tickers contains a non-string value', async () => {
      await request(app.getHttpServer())
        .post('/price-snapshots/update')
        .send({ tickers: [123, 'MSFT'] })
        .expect(400);
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

    it('GET /price-snapshots/latest returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer())
        .get('/price-snapshots/latest')
        .expect(401);
    });

    it('GET /price-snapshots/latest/:ticker returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer())
        .get('/price-snapshots/latest/AAPL')
        .expect(401);
    });

    it('POST /price-snapshots/update returns 401 without Authorization header', async () => {
      await request(unauthApp.getHttpServer())
        .post('/price-snapshots/update')
        .expect(401);
    });
  });
});
