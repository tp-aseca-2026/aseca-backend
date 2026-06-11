import request from 'supertest';
import {
  buildApp,
  CompanySearchResult,
  EdgarClient,
  errorResponse,
  first,
  jsonResponse,
  SecTickerData,
  TICKERS_DATA,
} from './helpers';

describe('GET /edgar/companies/search (integration)', () => {
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

  it('returns 200 with companies matching a name query', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(TICKERS_DATA));

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/search?q=apple')
      .expect(200);
    const body = res.body as CompanySearchResult[];
    const firstCompany = first(body);

    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(firstCompany).toMatchObject({
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      cik: '0000320193',
    });
  });

  it('returns companies matching by ticker symbol', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(TICKERS_DATA));

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/search?q=MSFT')
      .expect(200);
    const body = res.body as CompanySearchResult[];

    expect(body.some((company) => company.ticker === 'MSFT')).toBe(true);
  });

  it('search is case-insensitive', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(TICKERS_DATA));

    const lowerRes = await request(app.getHttpServer())
      .get('/edgar/companies/search?q=apple')
      .expect(200);
    const upperRes = await request(app.getHttpServer())
      .get('/edgar/companies/search?q=APPLE')
      .expect(200);

    const lowerBody = lowerRes.body as CompanySearchResult[];
    const upperBody = upperRes.body as CompanySearchResult[];

    expect(lowerBody).toEqual(upperBody);
  });

  it('returns CIK padded to 10 digits with leading zeros', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(TICKERS_DATA));

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/search?q=apple')
      .expect(200);
    const body = res.body as CompanySearchResult[];
    const firstCompany = first(body);

    expect(firstCompany.cik).toMatch(/^\d{10}$/);
    expect(firstCompany.cik).toBe('0000320193');
  });

  it('caps results at 10 when more matches exist', async () => {
    const manyTickers: SecTickerData = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [
        String(i),
        {
          cik_str: 100000 + i,
          ticker: `CORP${i}`,
          title: `Corporation Number ${i}`,
        },
      ]),
    );

    fetchSpy.mockResolvedValue(jsonResponse(manyTickers));

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/search?q=Corp')
      .expect(200);
    const body = res.body as CompanySearchResult[];

    expect(body.length).toBeLessThanOrEqual(10);
  });

  it('returns 400 when the q query parameter is missing', async () => {
    await request(app.getHttpServer())
      .get('/edgar/companies/search')
      .expect(400);
  });

  it('returns 400 when q is a blank string', async () => {
    await request(app.getHttpServer())
      .get('/edgar/companies/search?q=   ')
      .expect(400);
  });

  it('returns 502 when the SEC API call fails', async () => {
    fetchSpy.mockResolvedValue(errorResponse(503, 'Service Unavailable'));

    await request(app.getHttpServer())
      .get('/edgar/companies/search?q=apple')
      .expect(502);
  });
});
