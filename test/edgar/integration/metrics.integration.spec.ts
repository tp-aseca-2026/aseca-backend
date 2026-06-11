import request from 'supertest';
import {
  APPLE_CONCEPTS,
  buildApp,
  EdgarClient,
  jsonResponse,
  makeFactsData,
  MetricsResponse,
  mockFetchForConcepts,
  TICKERS_DATA,
} from './helpers';

describe('GET /edgar/companies/:ticker/metrics (integration)', () => {
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

  it('returns 200 with all five metric fields', async () => {
    fetchSpy.mockImplementation(
      mockFetchForConcepts(TICKERS_DATA, { concepts: APPLE_CONCEPTS }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/metrics')
      .expect(200);
    const body = res.body as MetricsResponse;

    expect(body).toHaveProperty('revenue');
    expect(body).toHaveProperty('netIncome');
    expect(body).toHaveProperty('eps');
    expect(body).toHaveProperty('totalAssets');
    expect(body).toHaveProperty('totalLiabilities');
  });

  it('returns each metric with the correct data point shape', async () => {
    fetchSpy.mockImplementation(
      mockFetchForConcepts(TICKERS_DATA, { concepts: APPLE_CONCEPTS }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/metrics')
      .expect(200);
    const body = res.body as MetricsResponse;

    expect(body.revenue).not.toBeNull();

    if (body.revenue === null) {
      throw new Error('Expected revenue to be present');
    }

    expect(typeof body.revenue.fy).toBe('number');
    expect(typeof body.revenue.fp).toBe('string');
    expect(typeof body.revenue.end).toBe('string');
    expect(typeof body.revenue.filed).toBe('string');
    expect(typeof body.revenue.form).toBe('string');
    expect(typeof body.revenue.val).toBe('number');
  });

  it('returns the most recent single data point for revenue', async () => {
    fetchSpy.mockImplementation(
      mockFetchForConcepts(TICKERS_DATA, { concepts: APPLE_CONCEPTS }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/metrics')
      .expect(200);
    const body = res.body as MetricsResponse;

    expect(body.revenue).not.toBeNull();

    if (body.revenue === null) {
      throw new Error('Expected revenue to be present');
    }

    expect(body.revenue.end).toBe('2023-09-30');
    expect(body.revenue.val).toBe(383285000000);
  });

  it('returns null for metrics when no concept data and companyfacts is also empty', async () => {
    fetchSpy.mockImplementation(
      mockFetchForConcepts(
        TICKERS_DATA,
        { concepts: {} },
        {
          data: {
            cik: 320193,
            entityName: 'Apple Inc.',
            facts: { 'us-gaap': {} },
          },
        },
      ),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/metrics')
      .expect(200);
    const body = res.body as MetricsResponse;

    expect(body.revenue).toBeNull();
    expect(body.netIncome).toBeNull();
  });

  it('falls back to companyfacts when all companyconcept calls return 404', async () => {
    fetchSpy.mockImplementation(
      mockFetchForConcepts(
        TICKERS_DATA,
        { concepts: {} },
        { data: makeFactsData() },
      ),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/metrics')
      .expect(200);
    const body = res.body as MetricsResponse;

    expect(body.revenue).not.toBeNull();
    expect(body.revenue?.val).toBe(383285000000);
  });

  it('falls back to SalesRevenueNet when Revenues is absent', async () => {
    fetchSpy.mockImplementation(
      mockFetchForConcepts(TICKERS_DATA, {
        concepts: {
          SalesRevenueNet: {
            label: 'Sales Revenue Net',
            units: {
              USD: [
                {
                  end: '2020-12-31',
                  val: 999999,
                  fy: 2020,
                  fp: 'FY',
                  form: '10-K',
                  filed: '2021-01-01',
                  accn: 'x',
                },
              ],
            },
          },
        },
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/metrics')
      .expect(200);
    const body = res.body as MetricsResponse;

    expect(body.revenue).not.toBeNull();

    if (body.revenue === null) {
      throw new Error('Expected revenue to be present');
    }

    expect(body.revenue.val).toBe(999999);
  });

  it('returns 404 when company has no XBRL data in concepts nor in companyfacts', async () => {
    fetchSpy.mockImplementation(
      mockFetchForConcepts(TICKERS_DATA, { concepts: {} }),
    );

    await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/metrics')
      .expect(404);
  });

  it('returns 404 when ticker is not in the company list', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(TICKERS_DATA));

    await request(app.getHttpServer())
      .get('/edgar/companies/UNKN/metrics')
      .expect(404);
  });

  it('returns 502 when the SEC facts API fails', async () => {
    fetchSpy.mockImplementation(
      mockFetchForConcepts(TICKERS_DATA, {
        error: { status: 503, statusText: 'Service Unavailable' },
      }),
    );

    await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/metrics')
      .expect(502);
  });
});
