import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import { buildApp, cleanDb, StockResponse } from './helpers';

describe('POST /stocks (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await buildApp(true);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(prisma);
  });

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

    const saved = await prisma.stock.findUnique({ where: { ticker: 'MSFT' } });

    expect(saved).not.toBeNull();
    if (saved === null) throw new Error('Expected stock to be saved');
    expect(saved.ticker).toBe('MSFT');
  });

  it('normalizes ticker to uppercase before saving', async () => {
    const res = await request(app.getHttpServer())
      .post('/stocks')
      .send({ ticker: 'tsla' })
      .expect(201);
    const body = res.body as StockResponse;

    expect(body.ticker).toBe('TSLA');

    const saved = await prisma.stock.findUnique({ where: { ticker: 'TSLA' } });
    expect(saved).not.toBeNull();
  });

  it('trims whitespace from ticker before saving', async () => {
    const res = await request(app.getHttpServer())
      .post('/stocks')
      .send({ ticker: '  GOOG  ' })
      .expect(201);
    const body = res.body as StockResponse;

    expect(body.ticker).toBe('GOOG');

    const saved = await prisma.stock.findUnique({ where: { ticker: 'GOOG' } });
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
