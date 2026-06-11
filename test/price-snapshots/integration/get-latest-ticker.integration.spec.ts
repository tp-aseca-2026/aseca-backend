import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  bodyAs,
  buildAuthApp,
  cleanDb,
  PriceSnapshotResponseBody,
} from './helpers';

describe('GET /price-snapshots/latest/:ticker (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await buildAuthApp());
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(prisma);
  });

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
