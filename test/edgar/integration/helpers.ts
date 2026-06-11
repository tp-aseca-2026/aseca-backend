import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { EdgarClient } from '../../../src/edgar/infrastructure/edgar.client';

export type FetchInput = Parameters<typeof fetch>[0];

export type SecTicker = {
  cik_str: number;
  ticker: string;
  title: string;
};

export type SecTickerData = Record<string, SecTicker>;

export type SecFactPoint = {
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  accn: string;
};

export type SecFact = {
  label: string;
  units: Record<string, SecFactPoint[]>;
};

export type SecFactsData = {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap': Record<string, SecFact>;
  };
};

export type SubmissionRecent = {
  accessionNumber: string[];
  filingDate: string[];
  form: string[];
  reportDate: string[];
  primaryDocument: string[];
};

export type SecSubmissionsData = {
  cik: string;
  name: string;
  tickers: string[];
  filings: {
    recent: SubmissionRecent;
  };
};

export type CompanySearchResult = {
  companyName: string;
  ticker: string;
  cik: string;
};

export type MetricDataPoint = {
  fy: number;
  fp: string;
  end: string;
  filed: string;
  form: string;
  val: number;
};

export type MetricsResponse = {
  revenue: MetricDataPoint | null;
  netIncome: MetricDataPoint | null;
  eps: MetricDataPoint | null;
  totalAssets: MetricDataPoint | null;
  totalLiabilities: MetricDataPoint | null;
};

export type FilingResponse = {
  form: string;
  filingDate: string;
  accessionNumber: string;
  reportDate: string | null;
  primaryDocument: string | null;
  link: string;
};

export type HistoricalMetricsResponse = {
  revenue: MetricDataPoint[];
  netIncome: MetricDataPoint[];
  eps: MetricDataPoint[];
  totalAssets: MetricDataPoint[];
  totalLiabilities: MetricDataPoint[];
};

export const first = <T>(items: T[]): T => {
  const item = items[0];

  if (item === undefined) {
    throw new Error('Expected array to contain at least one item');
  }

  return item;
};

export const getUrlString = (url: FetchInput): string => {
  if (typeof url === 'string') {
    return url;
  }

  if (url instanceof URL) {
    return url.href;
  }

  return url.url;
};

export const jsonResponse = (data: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  }) as unknown as Response;

export const errorResponse = (status: number, statusText: string): Response =>
  ({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  }) as unknown as Response;

export const TICKERS_DATA: SecTickerData = {
  '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '1': { cik_str: 789019, ticker: 'MSFT', title: 'Microsoft Corporation' },
  '2': { cik_str: 1018724, ticker: 'AMZN', title: 'Amazon.com Inc.' },
};

export const makeFactsData = (
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

export const makeSubmissionsData = (
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

export type SecConceptsData = Record<string, SecFact>;

export const APPLE_CONCEPTS: SecConceptsData = {
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
};

export const mockFetchForConcepts =
  (
    tickersData: SecTickerData,
    conceptsCall:
      | { concepts: SecConceptsData }
      | { error: { status: number; statusText: string } },
    factsFallback?:
      | { data: SecFactsData }
      | { error: { status: number; statusText: string } },
  ) =>
  (url: FetchInput): Promise<Response> => {
    const urlStr = getUrlString(url);

    if (urlStr.includes('company_tickers.json')) {
      return Promise.resolve(jsonResponse(tickersData));
    }

    if ('error' in conceptsCall) {
      return Promise.resolve(
        errorResponse(conceptsCall.error.status, conceptsCall.error.statusText),
      );
    }

    const conceptMatch = urlStr.match(/\/us-gaap\/([^/]+)\.json/);
    if (conceptMatch) {
      const concept = conceptMatch[1];
      const data = conceptsCall.concepts[concept];
      if (data) return Promise.resolve(jsonResponse(data));
      return Promise.resolve(jsonResponse({}, 404));
    }

    if (urlStr.includes('companyfacts')) {
      if (!factsFallback) return Promise.resolve(jsonResponse({}, 404));
      if ('error' in factsFallback)
        return Promise.resolve(
          errorResponse(
            factsFallback.error.status,
            factsFallback.error.statusText,
          ),
        );
      return Promise.resolve(jsonResponse(factsFallback.data));
    }

    return Promise.resolve(jsonResponse({}, 404));
  };

export const mockFetchForTicker =
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

export async function buildApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return { app, moduleRef };
}

export { EdgarClient };
