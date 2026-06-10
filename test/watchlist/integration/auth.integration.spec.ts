import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';

describe('Watchlist auth protection (integration)', () => {
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

  it('GET /watchlist returns 401 without Authorization header', async () => {
    await request(app.getHttpServer()).get('/watchlist').expect(401);
  });

  it('POST /watchlist returns 401 without Authorization header', async () => {
    await request(app.getHttpServer())
      .post('/watchlist')
      .send({ ticker: 'WLTST' })
      .expect(401);
  });

  it('DELETE /watchlist/:ticker returns 401 without Authorization header', async () => {
    await request(app.getHttpServer()).delete('/watchlist/WLTST').expect(401);
  });
});
