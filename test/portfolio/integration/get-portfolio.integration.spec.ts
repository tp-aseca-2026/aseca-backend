import { INestApplication } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  bodyAs,
  buildAuthApp,
  cleanDb,
  PortfolioResponseBody,
  TEST_USER,
} from './helpers';

describe('GET /portfolio (integration)', () => {
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

    await prisma.user.create({
      data: {
        id: TEST_USER.id,
        email: TEST_USER.email,
        passwordHash: 'hashed-password',
      },
    });
  });

  it('returns an empty portfolio when the user has no transactions', async () => {
    const res = await request(app.getHttpServer())
      .get('/portfolio')
      .expect(200);

    const body = bodyAs<PortfolioResponseBody>(res);

    expect(body).toEqual({
      positions: [],
      summary: {
        totalCostBasis: 0,
        currentValue: 0,
        unrealizedProfitLoss: 0,
        unrealizedProfitLossPercentage: 0,
        realizedProfitLoss: 0,
        totalProfitLoss: 0,
        lastPriceUpdatedAt: null,
      },
    });
  });

  it('returns a position valued with the latest stored market price', async () => {
    const stock = await prisma.stock.create({
      data: {
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
      },
    });

    await prisma.transaction.create({
      data: {
        userId: TEST_USER.id,
        stockId: stock.id,
        type: TransactionType.BUY,
        quantity: 10,
        price: 100,
        executedAt: new Date('2026-05-20T09:00:00.000Z'),
      },
    });

    const fetchedAt = new Date('2026-05-20T10:00:00.000Z');

    await prisma.priceSnapshot.create({
      data: {
        stockId: stock.id,
        price: 120,
        fetchedAt,
      },
    });

    const res = await request(app.getHttpServer())
      .get('/portfolio')
      .expect(200);

    const body = bodyAs<PortfolioResponseBody>(res);

    expect(body.positions).toHaveLength(1);

    const position = body.positions[0];

    if (position === undefined) {
      throw new Error('Expected one portfolio position');
    }

    expect(position).toMatchObject({
      stockId: stock.id,
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      quantity: 10,
      averageBuyPrice: 100,
      costBasis: 1000,
      latestPrice: 120,
      currentValue: 1200,
      unrealizedProfitLoss: 200,
      unrealizedProfitLossPercentage: 20,
      realizedProfitLoss: 0,
      totalProfitLoss: 200,
    });

    expect(new Date(position.lastPriceUpdatedAt ?? '').toISOString()).toBe(
      fetchedAt.toISOString(),
    );

    expect(body.summary).toMatchObject({
      totalCostBasis: 1000,
      currentValue: 1200,
      unrealizedProfitLoss: 200,
      unrealizedProfitLossPercentage: 20,
      realizedProfitLoss: 0,
      totalProfitLoss: 200,
    });

    expect(new Date(body.summary.lastPriceUpdatedAt ?? '').toISOString()).toBe(
      fetchedAt.toISOString(),
    );
  });

  it('calculates realized and unrealized profit/loss using FIFO', async () => {
    const stock = await prisma.stock.create({
      data: {
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          userId: TEST_USER.id,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 10,
          price: 100,
          executedAt: new Date('2026-05-20T09:00:00.000Z'),
        },
        {
          userId: TEST_USER.id,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 10,
          price: 200,
          executedAt: new Date('2026-05-20T09:10:00.000Z'),
        },
        {
          userId: TEST_USER.id,
          stockId: stock.id,
          type: TransactionType.SELL,
          quantity: 5,
          price: 150,
          executedAt: new Date('2026-05-20T09:20:00.000Z'),
        },
      ],
    });

    await prisma.priceSnapshot.create({
      data: {
        stockId: stock.id,
        price: 180,
        fetchedAt: new Date('2026-05-20T10:00:00.000Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .get('/portfolio')
      .expect(200);

    const body = bodyAs<PortfolioResponseBody>(res);

    expect(body.positions).toHaveLength(1);

    const position = body.positions[0];

    if (position === undefined) {
      throw new Error('Expected one portfolio position');
    }

    expect(position).toMatchObject({
      stockId: stock.id,
      ticker: 'AAPL',
      quantity: 15,
      averageBuyPrice: 166.67,
      costBasis: 2500,
      latestPrice: 180,
      currentValue: 2700,
      unrealizedProfitLoss: 200,
      unrealizedProfitLossPercentage: 8,
      realizedProfitLoss: 250,
      totalProfitLoss: 450,
    });

    expect(body.summary).toMatchObject({
      totalCostBasis: 2500,
      currentValue: 2700,
      unrealizedProfitLoss: 200,
      unrealizedProfitLossPercentage: 8,
      realizedProfitLoss: 250,
      totalProfitLoss: 450,
    });
  });

  it('returns null market valuation fields when latest price is missing', async () => {
    const stock = await prisma.stock.create({
      data: {
        ticker: 'MSFT',
        companyName: 'Microsoft',
      },
    });

    await prisma.transaction.create({
      data: {
        userId: TEST_USER.id,
        stockId: stock.id,
        type: TransactionType.BUY,
        quantity: 5,
        price: 50,
        executedAt: new Date('2026-05-20T09:00:00.000Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .get('/portfolio')
      .expect(200);

    const body = bodyAs<PortfolioResponseBody>(res);

    expect(body.positions).toHaveLength(1);

    const position = body.positions[0];

    if (position === undefined) {
      throw new Error('Expected one portfolio position');
    }

    expect(position).toEqual({
      stockId: stock.id,
      ticker: 'MSFT',
      companyName: 'Microsoft',
      quantity: 5,
      averageBuyPrice: 50,
      costBasis: 250,
      latestPrice: null,
      currentValue: null,
      unrealizedProfitLoss: null,
      unrealizedProfitLossPercentage: null,
      realizedProfitLoss: 0,
      totalProfitLoss: null,
      lastPriceUpdatedAt: null,
    });

    expect(body.summary).toEqual({
      totalCostBasis: 250,
      currentValue: null,
      unrealizedProfitLoss: null,
      unrealizedProfitLossPercentage: null,
      realizedProfitLoss: 0,
      totalProfitLoss: null,
      lastPriceUpdatedAt: null,
    });
  });

  it('does not return closed positions in the current portfolio', async () => {
    const stock = await prisma.stock.create({
      data: {
        ticker: 'TSLA',
        companyName: 'Tesla Inc.',
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          userId: TEST_USER.id,
          stockId: stock.id,
          type: TransactionType.BUY,
          quantity: 10,
          price: 100,
          executedAt: new Date('2026-05-20T09:00:00.000Z'),
        },
        {
          userId: TEST_USER.id,
          stockId: stock.id,
          type: TransactionType.SELL,
          quantity: 10,
          price: 110,
          executedAt: new Date('2026-05-20T09:10:00.000Z'),
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .get('/portfolio')
      .expect(200);

    const body = bodyAs<PortfolioResponseBody>(res);

    expect(body.positions).toEqual([]);
    expect(body.summary).toEqual({
      totalCostBasis: 0,
      currentValue: 0,
      unrealizedProfitLoss: 0,
      unrealizedProfitLossPercentage: 0,
      realizedProfitLoss: 0,
      totalProfitLoss: 0,
      lastPriceUpdatedAt: null,
    });
  });
});
