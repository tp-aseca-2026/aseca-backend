import { INestApplication, InternalServerErrorException } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../../../src/database/prisma.service';
import { PriceSnapshotsService } from '../../../src/price-snapshots/service/price-snapshots.service';
import {
  bodyAs,
  buildAuthApp,
  cleanDb,
  MOCK_UPDATE_RESULT,
  UpdatePriceSnapshotsResponseBody,
} from './helpers';

describe('POST /price-snapshots/update (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let priceSnapshotsService: PriceSnapshotsService;
  let runUpdateSpy: jest.SpiedFunction<PriceSnapshotsService['runUpdate']>;

  beforeAll(async () => {
    ({ app, prisma, priceSnapshotsService } = await buildAuthApp());
  });

  afterAll(async () => {
    await cleanDb(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(prisma);

    runUpdateSpy = jest
      .spyOn(priceSnapshotsService, 'runUpdate')
      .mockResolvedValue(MOCK_UPDATE_RESULT);
  });

  afterEach(() => {
    runUpdateSpy?.mockRestore();
  });

  it('returns 201 with the update result when the script succeeds', async () => {
    const res = await request(app.getHttpServer())
      .post('/price-snapshots/update')
      .expect(201);

    const body = bodyAs<UpdatePriceSnapshotsResponseBody>(res);

    expect(typeof body.processed).toBe('number');
    expect(typeof body.saved).toBe('number');
    expect(Array.isArray(body.failed)).toBe(true);
  });

  it('calls the service without tickers when body is empty', async () => {
    await request(app.getHttpServer())
      .post('/price-snapshots/update')
      .expect(201);

    expect(runUpdateSpy).toHaveBeenCalledWith(undefined);
  });

  it('passes the tickers array to the service when provided', async () => {
    await request(app.getHttpServer())
      .post('/price-snapshots/update')
      .send({ tickers: ['AAPL', 'MSFT'] })
      .expect(201);

    expect(runUpdateSpy).toHaveBeenCalledWith(['AAPL', 'MSFT']);
  });

  it('returns 500 when the service throws InternalServerErrorException', async () => {
    runUpdateSpy.mockRejectedValue(
      new InternalServerErrorException('Price snapshot update failed'),
    );

    await request(app.getHttpServer())
      .post('/price-snapshots/update')
      .expect(500);
  });

  it('returns 400 when tickers is not an array', async () => {
    await request(app.getHttpServer())
      .post('/price-snapshots/update')
      .send({ tickers: 'AAPL' })
      .expect(400);
  });

  it('returns 400 when tickers contains a non-string value', async () => {
    await request(app.getHttpServer())
      .post('/price-snapshots/update')
      .send({ tickers: [123, 'MSFT'] })
      .expect(400);
  });
});
