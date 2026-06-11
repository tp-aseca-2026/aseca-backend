import request from 'supertest';
import {
  buildApp,
  EdgarClient,
  HistoricalMetricsResponse,
  jsonResponse,
  makeFactsData,
  mockFetchForTicker,
  SecFactPoint,
  TICKERS_DATA,
} from './helpers';

describe('GET /edgar/companies/:ticker/historical-metrics (integration)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let moduleRef: Awaited<ReturnType<typeof buildApp>>['moduleRef'];
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeAll(async () => {
    ({ app, moduleRef } = await buildApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    moduleRef.get(EdgarClient).clearCache();
  });

  it('returns 200 with arrays for all five metrics', async () => {
    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, { data: makeFactsData() }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/historical-metrics')
      .expect(200);
    const body = res.body as HistoricalMetricsResponse;

    expect(Array.isArray(body.revenue)).toBe(true);
    expect(Array.isArray(body.netIncome)).toBe(true);
    expect(Array.isArray(body.eps)).toBe(true);
    expect(Array.isArray(body.totalAssets)).toBe(true);
    expect(Array.isArray(body.totalLiabilities)).toBe(true);
  });

  it('returns multiple data points sorted most-recent-first', async () => {
    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, { data: makeFactsData() }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/historical-metrics')
      .expect(200);
    const body = res.body as HistoricalMetricsResponse;
    const { revenue } = body;

    expect(revenue.length).toBeGreaterThan(1);

    for (let i = 0; i < revenue.length - 1; i++) {
      const current = revenue[i];
      const next = revenue[i + 1];

      if (current === undefined || next === undefined) {
        throw new Error('Expected revenue data points to be present');
      }

      expect(current.end >= next.end).toBe(true);
    }
  });

  it('caps each metric at 8 data points', async () => {
    const manyPoints: SecFactPoint[] = Array.from({ length: 12 }, (_, i) => ({
      end: `2020-${String(i + 1).padStart(2, '0')}-30`,
      val: 100000 + i,
      fy: 2020,
      fp: `Q${(i % 4) + 1}`,
      form: '10-Q',
      filed: `2020-01-0${(i % 9) + 1}`,
      accn: 'x',
    }));

    const factsWithMany = makeFactsData();
    factsWithMany.facts['us-gaap'].Revenues.units.USD = manyPoints;

    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, { data: factsWithMany }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/historical-metrics')
      .expect(200);
    const body = res.body as HistoricalMetricsResponse;

    expect(body.revenue.length).toBeLessThanOrEqual(8);
  });

  it('returns 404 when ticker is not found', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(TICKERS_DATA));

    await request(app.getHttpServer())
      .get('/edgar/companies/UNKN/historical-metrics')
      .expect(404);
  });

  it('returns 502 when the SEC facts API fails', async () => {
    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, {
        error: { status: 503, statusText: 'Service Unavailable' },
      }),
    );

    await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/historical-metrics')
      .expect(502);
  });
});
