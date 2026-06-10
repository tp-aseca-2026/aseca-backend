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
  first,
  itemAt,
  makeGuardMock,
  setupTestUser,
  TEST_USER_EMAIL,
  TransactionResponse,
} from './helpers';

describe('GET /transactions (integration)', () => {
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

  it('returns an empty array when the user has no transactions', async () => {
    const res = await request(app.getHttpServer())
      .get('/transactions')
      .expect(200);
    expect(res.body).toEqual([]);
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
    await prisma.transaction.create({
      data: {
        userId: testUserId,
        stockId: stock.id,
        type: TransactionType.BUY,
        quantity: 1,
        price: 150,
        executedAt: new Date('2024-01-01T10:00:00Z'),
      },
    });
    await prisma.transaction.create({
      data: {
        userId: testUserId,
        stockId: stock.id,
        type: TransactionType.BUY,
        quantity: 2,
        price: 155,
        executedAt: new Date('2024-06-01T10:00:00Z'),
      },
    });

    const res = await request(app.getHttpServer())
      .get('/transactions')
      .expect(200);
    const body = res.body as TransactionResponse[];

    expect(
      new Date(itemAt(body, 0).executedAt) >=
        new Date(itemAt(body, 1).executedAt),
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
    const transaction = first(res.body as TransactionResponse[]);

    expect(typeof transaction.id).toBe('number');
    expect(transaction.userId).toBe(testUserId);
    expect(transaction.stockId).toBe(stock.id);
    expect(transaction.type).toBe(TransactionType.BUY);
    expect(transaction.quantity).toBe(1);
    expect(typeof transaction.executedAt).toBe('string');
  });
});
