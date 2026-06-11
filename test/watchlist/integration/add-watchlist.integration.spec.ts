import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { JwtAuthGuard } from '../../../src/auth/infrastructure/jwt-auth.guard';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  cleanTestData,
  cleanTestUsers,
  makeGuardMock,
  setupTestUsers,
  WatchlistItemResponse,
} from './helpers';

describe('POST /watchlist (integration)', () => {
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
    ({ testUserId } = await setupTestUsers(prisma));
  });

  afterAll(async () => {
    await cleanTestData(prisma);
    await cleanTestUsers(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanTestData(prisma);
  });

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
    await request(app.getHttpServer()).post('/watchlist').send({}).expect(400);
  });

  it('returns 400 when ticker is an empty string', async () => {
    await request(app.getHttpServer())
      .post('/watchlist')
      .send({ ticker: '' })
      .expect(400);
  });
});
