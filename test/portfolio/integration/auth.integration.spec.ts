import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';

describe('Portfolio auth protection (integration)', () => {
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

  it('GET /portfolio returns 401 without Authorization header', async () => {
    await request(unauthApp.getHttpServer()).get('/portfolio').expect(401);
  });
});
