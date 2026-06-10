import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';

describe('Transactions auth protection (integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /transactions/buy returns 401 without Authorization header', async () => {
    await request(app.getHttpServer())
      .post('/transactions/buy')
      .send({ ticker: 'AAPL', quantity: 1 })
      .expect(401);
  });

  it('POST /transactions/sell returns 401 without Authorization header', async () => {
    await request(app.getHttpServer())
      .post('/transactions/sell')
      .send({ ticker: 'AAPL', quantity: 1 })
      .expect(401);
  });

  it('GET /transactions returns 401 without Authorization header', async () => {
    await request(app.getHttpServer()).get('/transactions').expect(401);
  });
});
