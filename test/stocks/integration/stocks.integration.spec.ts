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

type TestUser = {
  id: number;
  email: string;
};

type AuthenticatedRequest = {
  user?: TestUser;
};

type StockResponse = {
  id: number;
  ticker: string;
  companyName: string | null;
  cik: string | null;
};

const TEST_USER: TestUser = { id: 1, email: 'test@example.com' };

const buildApp = async (
  overrideGuard: boolean,
): Promise<INestApplication<App>> => {
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
};

describe('Stocks (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext): boolean => {
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
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(prisma);
  });

  describe('POST /stocks', () => {
    it('creates a stock with all fields and returns 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: 'AAPL', companyName: 'Apple Inc.', cik: '0000320193' })
        .expect(201);

      const body = res.body as StockResponse;

      expect(typeof body.id).toBe('number');
      expect(body.ticker).toBe('AAPL');
      expect(body.companyName).toBe('Apple Inc.');
      expect(body.cik).toBe('0000320193');
    });

    it('persists the stock record in the database', async () => {
      await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: 'MSFT' })
        .expect(201);

      const saved = await prisma.stock.findUnique({
        where: { ticker: 'MSFT' },
      });

      expect(saved).not.toBeNull();

      if (saved === null) {
        throw new Error('Expected stock to be saved');
      }

      expect(saved.ticker).toBe('MSFT');
    });

    it('normalizes ticker to uppercase before saving', async () => {
      const res = await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: 'tsla' })
        .expect(201);
      const body = res.body as StockResponse;

      expect(body.ticker).toBe('TSLA');

      const saved = await prisma.stock.findUnique({
        where: { ticker: 'TSLA' },
      });

      expect(saved).not.toBeNull();
    });

    it('trims whitespace from ticker before saving', async () => {
      const res = await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: '  GOOG  ' })
        .expect(201);
      const body = res.body as StockResponse;

      expect(body.ticker).toBe('GOOG');

      const saved = await prisma.stock.findUnique({
        where: { ticker: 'GOOG' },
      });

      expect(saved).not.toBeNull();
    });

    it('creates a stock with only the required ticker field', async () => {
      const res = await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: 'AMZN' })
        .expect(201);
      const body = res.body as StockResponse;

      expect(body.ticker).toBe('AMZN');
      expect(body.companyName).toBeNull();
      expect(body.cik).toBeNull();
    });

    it('returns 409 when ticker already exists', async () => {
      await prisma.stock.create({ data: { ticker: 'AAPL' } });

      await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: 'AAPL' })
        .expect(409);
    });

    it('returns 409 when submitting a lowercase version of an existing ticker', async () => {
      await prisma.stock.create({ data: { ticker: 'NVDA' } });

      await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: 'nvda' })
        .expect(409);
    });

    it('does not insert a second record when duplicate is rejected', async () => {
      await prisma.stock.create({ data: { ticker: 'META' } });

      await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: 'META' })
        .expect(409);

      const count = await prisma.stock.count({ where: { ticker: 'META' } });

      expect(count).toBe(1);
    });

    it('returns 400 when ticker field is missing from the body', async () => {
      await request(app.getHttpServer())
        .post('/stocks')
        .send({ companyName: 'Apple Inc.' })
        .expect(400);
    });

    it('returns 400 when ticker is a blank string', async () => {
      await request(app.getHttpServer())
        .post('/stocks')
        .send({ ticker: '   ' })
        .expect(400);
    });
  });

  describe('GET /stocks/:ticker', () => {
    it('returns 200 with the stock for an existing ticker', async () => {
      await prisma.stock.create({
        data: { ticker: 'AAPL', companyName: 'Apple Inc.' },
      });

      const res = await request(app.getHttpServer())
        .get('/stocks/AAPL')
        .expect(200);
      const body = res.body as StockResponse;

      expect(typeof body.id).toBe('number');
      expect(body.ticker).toBe('AAPL');
      expect(body.companyName).toBe('Apple Inc.');
    });

    it('finds the stock when the path param ticker is lowercase', async () => {
      await prisma.stock.create({ data: { ticker: 'AAPL' } });

      const res = await request(app.getHttpServer())
        .get('/stocks/aapl')
        .expect(200);
      const body = res.body as StockResponse;

      expect(body.ticker).toBe('AAPL');
    });

    it('returns 404 for a ticker that does not exist in the database', async () => {
      await request(app.getHttpServer()).get('/stocks/NOTEXIST').expect(404);
    });

    it('trims whitespace from the path param before querying', async () => {
      await prisma.stock.create({ data: { ticker: 'AAPL' } });

      const res = await request(app.getHttpServer())
        .get('/stocks/%20AAPL%20')
        .expect(200);
      const body = res.body as StockResponse;

      expect(body.ticker).toBe('AAPL');
    });
  });

  describe('auth protection', () => {
    let unauthApp: INestApplication<App>;

    beforeAll(async () => {
      unauthApp = await buildApp(false);
    });

    afterAll(async () => {
      await unauthApp.close();
    });

    it('POST /stocks returns 401 when Authorization header is absent', async () => {
      await request(unauthApp.getHttpServer())
        .post('/stocks')
        .send({ ticker: 'AAPL' })
        .expect(401);
    });

    it('GET /stocks/:ticker returns 401 when Authorization header is absent', async () => {
      await request(unauthApp.getHttpServer()).get('/stocks/AAPL').expect(401);
    });
  });
});

async function cleanDb(prisma: PrismaService): Promise<void> {
  await prisma.watchlistItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.priceSnapshot.deleteMany();
  await prisma.stock.deleteMany();
}
