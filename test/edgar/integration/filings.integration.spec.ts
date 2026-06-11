import request from 'supertest';
import {
  buildApp,
  EdgarClient,
  FilingResponse,
  first,
  jsonResponse,
  makeSubmissionsData,
  mockFetchForTicker,
  SubmissionRecent,
  TICKERS_DATA,
} from './helpers';

describe('GET /edgar/companies/:ticker/filings (integration)', () => {
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

  it('returns 200 with only 10-K and 10-Q filings', async () => {
    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, { data: makeSubmissionsData() }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/filings')
      .expect(200);
    const body = res.body as FilingResponse[];
    const forms = body.map((filing) => filing.form);

    expect(Array.isArray(body)).toBe(true);
    expect(forms.every((form) => form === '10-K' || form === '10-Q')).toBe(
      true,
    );
    expect(forms).not.toContain('8-K');
  });

  it('returns filings with the expected shape', async () => {
    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, { data: makeSubmissionsData() }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/filings')
      .expect(200);
    const body = res.body as FilingResponse[];
    const firstFiling = first(body);

    expect(typeof firstFiling.form).toBe('string');
    expect(typeof firstFiling.filingDate).toBe('string');
    expect(typeof firstFiling.accessionNumber).toBe('string');
    expect(typeof firstFiling.link).toBe('string');
    expect(firstFiling.link).toContain('https://www.sec.gov');
  });

  it('constructs the SEC link correctly with primary document', async () => {
    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, {
        data: makeSubmissionsData({
          accessionNumber: ['0000320193-24-000123'],
          filingDate: ['2024-02-02'],
          form: ['10-K'],
          reportDate: ['2023-09-30'],
          primaryDocument: ['aapl-20230930.htm'],
        }),
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/filings')
      .expect(200);
    const body = res.body as FilingResponse[];
    const firstFiling = first(body);

    expect(firstFiling.link).toBe(
      'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20230930.htm',
    );
  });

  it('links to the filing index when primaryDocument is missing', async () => {
    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, {
        data: makeSubmissionsData({
          accessionNumber: ['0000320193-24-000123'],
          filingDate: ['2024-02-02'],
          form: ['10-K'],
          reportDate: [''],
          primaryDocument: [''],
        }),
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/filings')
      .expect(200);
    const body = res.body as FilingResponse[];
    const firstFiling = first(body);

    expect(firstFiling.link).toBe(
      'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/',
    );
    expect(firstFiling.primaryDocument).toBeNull();
  });

  it('limits results to 10 filings', async () => {
    const manyFilings: SubmissionRecent = {
      accessionNumber: Array.from(
        { length: 15 },
        (_, i) => `0000320193-24-${String(i).padStart(6, '0')}`,
      ),
      filingDate: Array.from({ length: 15 }, () => '2024-01-01'),
      form: Array.from({ length: 15 }, () => '10-Q'),
      reportDate: Array.from({ length: 15 }, () => '2023-12-31'),
      primaryDocument: Array.from({ length: 15 }, (_, i) => `doc${i}.htm`),
    };

    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, {
        data: makeSubmissionsData(manyFilings),
      }),
    );

    const res = await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/filings')
      .expect(200);
    const body = res.body as FilingResponse[];

    expect(body.length).toBeLessThanOrEqual(10);
  });

  it('returns 404 when ticker is not found', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(TICKERS_DATA));

    await request(app.getHttpServer())
      .get('/edgar/companies/UNKN/filings')
      .expect(404);
  });

  it('returns 502 when the SEC submissions API fails', async () => {
    fetchSpy.mockImplementation(
      mockFetchForTicker(TICKERS_DATA, {
        error: { status: 500, statusText: 'Internal Server Error' },
      }),
    );

    await request(app.getHttpServer())
      .get('/edgar/companies/AAPL/filings')
      .expect(502);
  });
});
