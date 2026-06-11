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
  DeletedWatchlistItemResponse,
  makeGuardMock,
  setupTestUsers,
} from './helpers';

describe('DELETE /watchlist/:ticker (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let testUserId: number;
  let otherUserId: number;

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
    ({ testUserId, otherUserId } = await setupTestUsers(prisma));
  });

  afterAll(async () => {
    await cleanTestData(prisma);
    await cleanTestUsers(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanTestData(prisma);
  });

  it('returns 200 with the deleted watchlist item', async () => {
    const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });
    await prisma.watchlistItem.create({
      data: { userId: testUserId, stockId: stock.id },
    });

    const res = await request(app.getHttpServer())
      .delete('/watchlist/WLTST')
      .expect(200);
    const body = res.body as DeletedWatchlistItemResponse;

    expect(typeof body.id).toBe('number');
    expect(body.userId).toBe(testUserId);
    expect(body.stockId).toBe(stock.id);
  });

  it('removes the item from the database after deletion', async () => {
    const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });
    await prisma.watchlistItem.create({
      data: { userId: testUserId, stockId: stock.id },
    });

    await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(200);

    const remaining = await prisma.watchlistItem.findFirst({
      where: { userId: testUserId, stockId: stock.id },
    });
    expect(remaining).toBeNull();
  });

  it('returns 404 when the ticker does not exist in the stocks table', async () => {
    await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(404);
  });

  it('returns 404 when the stock exists but is not in the user watchlist', async () => {
    await prisma.stock.create({ data: { ticker: 'WLTST' } });
    await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(404);
  });

  it('does not remove a watchlist item belonging to another user', async () => {
    const stock = await prisma.stock.create({ data: { ticker: 'WLTST' } });
    await prisma.watchlistItem.create({
      data: { userId: otherUserId, stockId: stock.id },
    });

    await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(404);

    const surviving = await prisma.watchlistItem.findFirst({
      where: { userId: otherUserId, stockId: stock.id },
    });
    expect(surviving).not.toBeNull();
  });
});
