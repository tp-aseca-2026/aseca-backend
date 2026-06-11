import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  cleanTestData,
  createStockWithPrice,
  ErrorResponse,
  first,
  makeGuardMock,
  setupTestUser,
  TEST_USER_EMAIL,
  TransactionResponse,
} from './helpers';

describe('POST /transactions/sell (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
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
