import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';

describe('PriceSnapshots auth protection (integration)', () => {
  let unauthApp: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    unauthApp = moduleRef.createNestApplication();

    unauthApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await unauthApp.init();
  });

  afterAll(async () => {
    await unauthApp.close();
  });

  it('GET /price-snapshots/latest returns 401 without Authorization header', async () => {
    await request(unauthApp.getHttpServer())
      .get('/price-snapshots/latest')
      .expect(401);
  });

  it('GET /price-snapshots/latest/:ticker returns 401 without Authorization header', async () => {
    await request(unauthApp.getHttpServer())
      .get('/price-snapshots/latest/AAPL')
      .expect(401);
  });

  it('POST /price-snapshots/update returns 401 without Authorization header', async () => {
    await request(unauthApp.getHttpServer())
      .post('/price-snapshots/update')
      .expect(401);
  });
});
