import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import { buildApp, cleanDb, StockResponse } from './helpers';

describe('GET /stocks/:ticker (integration)', () => {
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
