import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { buildApp } from './helpers';

describe('Stocks auth protection (integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp(false);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /stocks returns 401 when Authorization header is absent', async () => {
    await request(app.getHttpServer())
      .post('/stocks')
      .send({ ticker: 'AAPL' })
      .expect(401);
  });

  it('GET /stocks/:ticker returns 401 when Authorization header is absent', async () => {
    await request(app.getHttpServer()).get('/stocks/AAPL').expect(401);
  });
});
