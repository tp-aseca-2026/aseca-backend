import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  bodyAs,
  buildAuthApp,
  cleanDb,
  LatestPriceSnapshotsResponseBody,
} from './helpers';

describe('GET /price-snapshots/latest (integration)', () => {
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
