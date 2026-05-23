import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';

type FetchInput = Parameters<typeof fetch>[0];

type SecTicker = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SecTickerData = Record<string, SecTicker>;

type SecFactPoint = {
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  accn: string;
};

type SecFact = {
  label: string;
  units: Record<string, SecFactPoint[]>;
};

type SecFactsData = {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap': Record<string, SecFact>;
  };
};

type SubmissionRecent = {
  accessionNumber: string[];
  filingDate: string[];
  form: string[];
  reportDate: string[];
  primaryDocument: string[];
};

type SecSubmissionsData = {
  cik: string;
  name: string;
  tickers: string[];
  filings: {
    recent: SubmissionRecent;
  };
};

type CompanySearchResult = {
  companyName: string;
  ticker: string;
  cik: string;
};

type MetricDataPoint = {
  fy: number;
  fp: string;
  end: string;
  filed: string;
  form: string;
  val: number;
};

type MetricsResponse = {
  revenue: MetricDataPoint | null;
  netIncome: MetricDataPoint | null;
  eps: MetricDataPoint | null;
  totalAssets: MetricDataPoint | null;
  totalLiabilities: MetricDataPoint | null;
};

type FilingResponse = {
  form: string;
  filingDate: string;
  accessionNumber: string;
  reportDate: string | null;
  primaryDocument: string | null;
  link: string;
};

type HistoricalMetricsResponse = {
  revenue: MetricDataPoint[];
  netIncome: MetricDataPoint[];
  eps: MetricDataPoint[];
  totalAssets: MetricDataPoint[];
  totalLiabilities: MetricDataPoint[];
};

const first = <T>(items: T[]): T => {
  const item = items[0];

  if (item === undefined) {
    throw new Error('Expected array to contain at least one item');
  }

  return item;
};

const getUrlString = (url: FetchInput): string => {
  if (typeof url === 'string') {
    return url;
  }

  if (url instanceof URL) {
    return url.href;
  }

  return url.url;
};

const jsonResponse = (data: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  }) as unknown as Response;

const errorResponse = (status: number, statusText: string): Response =>
  ({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  }) as unknown as Response;

const TICKERS_DATA: SecTickerData = {
  '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corporation' },
  '2': { cik_str: 1018724, ticker: 'AMZN', title: 'Amazon.com Inc.' },
};

const makeFactsData = (
  gaapOverrides: Record<string, SecFact> = {},
): SecFactsData => ({
  cik: 320193,
  entityName: 'Apple Inc.',
  facts: {
    'us-gaap': {
      Revenues: {
        label: 'Revenue',
        units: {
          USD: [
            {
              end: '2023-09-30',
              val: 383285000000,
              fy: 2023,
              fp: 'FY',
              form: '10-K',
              filed: '2023-11-03',
              accn: 'x',
            },
            {
              end: '2023-06-30',
              val: 81797000000,
              fy: 2023,
              fp: 'Q3',
              form: '10-Q',
              filed: '2023-08-04',
              accn: 'x',
            },
            {
              end: '2023-03-31',
              val: 94836000000,
              fy: 2023,
              fp: 'Q2',
              form: '10-Q',
              filed: '2023-05-05',
              accn: 'x',
            },
          ],
        },
      },
      NetIncomeLoss: {
        label: 'Net Income',
        units: {
          USD: [
            {
              end: '2023-09-30',
              val: 96995000000,
              fy: 2023,
              fp: 'FY',
              form: '10-K',
              filed: '2023-11-03',
              accn: 'x',
            },
          ],
        },
      },
      EarningsPerShareDiluted: {
        label: 'EPS Diluted',
        units: {
          'USD/shares': [
            {
              end: '2023-09-30',
              val: 6.13,
              fy: 2023,
              fp: 'FY',
              form: '10-K',
              filed: '2023-11-03',
              accn: 'x',
            },
          ],
        },
      },
      Assets: {
        label: 'Total Assets',
        units: {
          USD: [
            {
              end: '2023-09-30',
              val: 352583000000,
              fy: 2023,
              fp: 'FY',
              form: '10-K',
              filed: '2023-11-03',
              accn: 'x',
            },
          ],
        },
      },
      Liabilities: {
        label: 'Total Liabilities',
        units: {
          USD: [
            {
              end: '2023-09-30',
              val: 290437000000,
              fy: 2023,
              fp: 'FY',
              form: '10-K',
              filed: '2023-11-03',
              accn: 'x',
            },
          ],
        },
      },
      ...gaapOverrides,
    },
  },
});

const makeSubmissionsData = (
  filingOverrides: Partial<SubmissionRecent> = {},
): SecSubmissionsData => ({
  cik: '0000320193',
  name: 'Apple Inc.',
  tickers: ['AAPL'],
  filings: {
    recent: {
      accessionNumber: [
        '0000320193-24-000123',
        '0000320193-23-000456',
        '0000320193-23-000789',
      ],
      filingDate: ['2024-02-02', '2023-08-04', '2023-05-05'],
      form: ['10-K', '10-Q', '8-K'],
      reportDate: ['2023-09-30', '2023-06-30', ''],
      primaryDocument: ['aapl-20230930.htm', 'aapl-20230630.htm', ''],
      ...filingOverrides,
    },
  },
});

const mockFetchForTicker =
  (
    tickersData: unknown,
    secondCallData:
      | { data: unknown; status?: number }
      | { error: { status: number; statusText: string } },
  ) =>
  (url: FetchInput): Promise<Response> => {
    const urlStr = getUrlString(url);

    if (urlStr.includes('company_tickers.json')) {
      return Promise.resolve(jsonResponse(tickersData));
    }

    if ('error' in secondCallData) {
      return Promise.resolve(
        errorResponse(
          secondCallData.error.status,
          secondCallData.error.statusText,
        ),
      );
    }

    return Promise.resolve(
      jsonResponse(secondCallData.data, secondCallData.status ?? 200),
    );
  };

describe('EDGAR (integration)', () => {
  let app: INestApplication<App>;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

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

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('GET /edgar/companies/search', () => {
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

  describe('GET /edgar/companies/:ticker/metrics', () => {
    it('returns 200 with all five metric fields', async () => {
      fetchSpy.mockImplementation(
        mockFetchForTicker(TICKERS_DATA, { data: makeFactsData() }),
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
        mockFetchForTicker(TICKERS_DATA, { data: makeFactsData() }),
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
        mockFetchForTicker(TICKERS_DATA, { data: makeFactsData() }),
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

    it('returns null for metrics absent from GAAP facts', async () => {
      const emptyFacts: SecFactsData = {
        cik: 320193,
        entityName: 'Apple Inc.',
        facts: { 'us-gaap': {} },
      };

      fetchSpy.mockImplementation(
        mockFetchForTicker(TICKERS_DATA, { data: emptyFacts }),
      );

      const res = await request(app.getHttpServer())
        .get('/edgar/companies/AAPL/metrics')
        .expect(200);
      const body = res.body as MetricsResponse;

      expect(body.revenue).toBeNull();
      expect(body.netIncome).toBeNull();
    });

    it('falls back to SalesRevenueNet when Revenues is absent', async () => {
      const fallbackFacts: SecFactsData = {
        cik: 320193,
        entityName: 'Apple Inc.',
        facts: {
          'us-gaap': {
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
        },
      };

      fetchSpy.mockImplementation(
        mockFetchForTicker(TICKERS_DATA, { data: fallbackFacts }),
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

    it('returns 404 when ticker is not in the company list', async () => {
      fetchSpy.mockResolvedValue(jsonResponse(TICKERS_DATA));

      await request(app.getHttpServer())
        .get('/edgar/companies/UNKN/metrics')
        .expect(404);
    });

    it('returns 404 when company has no XBRL financial data', async () => {
      fetchSpy.mockImplementation(
        mockFetchForTicker(TICKERS_DATA, {
          error: { status: 404, statusText: 'Not Found' },
        }),
      );

      await request(app.getHttpServer())
        .get('/edgar/companies/AAPL/metrics')
        .expect(404);
    });

    it('returns 502 when the SEC facts API fails', async () => {
      fetchSpy.mockImplementation(
        mockFetchForTicker(TICKERS_DATA, {
          error: { status: 503, statusText: 'Service Unavailable' },
        }),
      );

      await request(app.getHttpServer())
        .get('/edgar/companies/AAPL/metrics')
        .expect(502);
    });
  });

  describe('GET /edgar/companies/:ticker/filings', () => {
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

  describe('GET /edgar/companies/:ticker/historical-metrics', () => {
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
});
