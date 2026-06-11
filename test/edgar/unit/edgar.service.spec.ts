import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EdgarClient } from '../../../src/edgar/infrastructure/edgar.client';
import { EdgarService } from '../../../src/edgar/service/edgar.service';

const makeTickersResponse = (
  entries: Array<{ cik_str: number; ticker: string; title: string }>,
) => Object.fromEntries(entries.map((e, i) => [String(i), e]));

const APPLE_TICKERS = makeTickersResponse([
  { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
]);

const APPLE_CONCEPTS: Record<string, { units: Record<string, unknown[]> }> = {
  Revenues: {
    units: {
      USD: [
        {
          end: '2023-09-30',
          val: 383285000000,
          fy: 2023,
          fp: 'FY',
          form: '10-K',
          filed: '2023-11-03',
          accn: '0000320193-23-000001',
        },
        {
          end: '2023-06-30',
          val: 81797000000,
          fy: 2023,
          fp: 'Q3',
          form: '10-Q',
          filed: '2023-08-04',
          accn: '0000320193-23-000002',
        },
        {
          end: '2023-03-31',
          val: 94836000000,
          fy: 2023,
          fp: 'Q2',
          form: '10-Q',
          filed: '2023-05-05',
          accn: '0000320193-23-000003',
        },
        {
          end: '2022-12-31',
          val: 117154000000,
          fy: 2023,
          fp: 'Q1',
          form: '10-Q',
          filed: '2023-02-03',
          accn: '0000320193-23-000004',
        },
      ],
    },
  },
  NetIncomeLoss: {
    units: {
      USD: [
        {
          end: '2023-09-30',
          val: 96995000000,
          fy: 2023,
          fp: 'FY',
          form: '10-K',
          filed: '2023-11-03',
          accn: '0000320193-23-000001',
        },
        {
          end: '2023-06-30',
          val: 19881000000,
          fy: 2023,
          fp: 'Q3',
          form: '10-Q',
          filed: '2023-08-04',
          accn: '0000320193-23-000002',
        },
      ],
    },
  },
  EarningsPerShareDiluted: {
    units: {
      'USD/shares': [
        {
          end: '2023-09-30',
          val: 6.13,
          fy: 2023,
          fp: 'FY',
          form: '10-K',
          filed: '2023-11-03',
          accn: '0000320193-23-000001',
        },
      ],
    },
  },
  Assets: {
    units: {
      USD: [
        {
          end: '2023-09-30',
          val: 352583000000,
          fy: 2023,
          fp: 'FY',
          form: '10-K',
          filed: '2023-11-03',
          accn: '0000320193-23-000001',
        },
      ],
    },
  },
  Liabilities: {
    units: {
      USD: [
        {
          end: '2023-09-30',
          val: 290437000000,
          fy: 2023,
          fp: 'FY',
          form: '10-K',
          filed: '2023-11-03',
          accn: '0000320193-23-000001',
        },
      ],
    },
  },
};

const makeSubmissions = (
  filingOverrides: Partial<{
    accessionNumber: string[];
    filingDate: string[];
    form: string[];
    reportDate: string[];
    primaryDocument: string[];
  }> = {},
) => ({
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

const mockConceptByName = (
  overrides: Record<string, { units: Record<string, unknown[]> }> = {},
) => {
  const concepts = { ...APPLE_CONCEPTS, ...overrides };
  return (cik: string, concept: string) => {
    const data = concepts[concept];
    if (data) return Promise.resolve(data);
    return Promise.reject(
      new NotFoundException(
        `No XBRL data for concept ${concept} and CIK ${cik}`,
      ),
    );
  };
};

describe('EdgarService', () => {
  let service: EdgarService;
  let edgarClient: jest.Mocked<EdgarClient>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EdgarService,
        {
          provide: EdgarClient,
          useValue: {
            fetchCompanyTickers: jest.fn(),
            fetchSubmissions: jest.fn(),
            fetchCompanyConcept: jest.fn(),
            fetchCompanyFacts: jest.fn(),
            fetchFullTextSearch: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(EdgarService);
    edgarClient = moduleRef.get(EdgarClient);
    edgarClient.fetchFullTextSearch.mockResolvedValue({
      hits: {
        hits: [],
      },
    });
  });

  describe('searchCompanies', () => {
    it('returns Apple Inc. with ticker and CIK when searching "Apple"', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);

      const result = await service.searchCompanies('Apple');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        companyName: 'Apple Inc.',
        ticker: 'AAPL',
        cik: '0000320193',
      });
    });

    it('is case-insensitive', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);

      const result = await service.searchCompanies('apple');

      expect(result).toHaveLength(1);
      expect(result[0].companyName).toBe('Apple Inc.');
    });

    it('also matches by ticker symbol', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);

      const result = await service.searchCompanies('AAPL');

      expect(result).toHaveLength(1);
      expect(result[0].ticker).toBe('AAPL');
    });

    it('normalizes CIK to 10 digits with leading zeros', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);

      const result = await service.searchCompanies('Apple');

      expect(result[0].cik).toBe('0000320193');
    });

    it('limits results to 10', async () => {
      const manyEntries = Array.from({ length: 15 }, (_, i) => ({
        cik_str: 100000 + i,
        ticker: `CORP${i}`,
        title: `Corporation Number ${i}`,
      }));
      edgarClient.fetchCompanyTickers.mockResolvedValue(
        makeTickersResponse(manyEntries),
      );

      const result = await service.searchCompanies('Corp');

      expect(result).toHaveLength(10);
    });
  });

  describe('getMetrics', () => {
    it('extracts Revenue from companyconcept', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(mockConceptByName());

      const result = await service.getMetrics('AAPL');

      expect(result.revenue).not.toBeNull();
      expect(result.revenue?.val).toBe(383285000000);
    });

    it('extracts Net Income from companyconcept', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(mockConceptByName());

      const result = await service.getMetrics('AAPL');

      expect(result.netIncome).not.toBeNull();
      expect(result.netIncome?.val).toBe(96995000000);
    });

    it('uses SalesRevenueNet fallback when Revenues is not present', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(
        mockConceptByName({
          Revenues: undefined as never,
          SalesRevenueNet: {
            units: {
              USD: [
                {
                  end: '2020-12-31',
                  val: 999999,
                  fy: 2020,
                  fp: 'FY',
                  form: '10-K',
                  filed: '2021-01-01',
                  accn: '1',
                },
              ],
            },
          },
        }),
      );

      const result = await service.getMetrics('AAPL');

      expect(result.revenue).not.toBeNull();
      expect(result.revenue?.val).toBe(999999);
    });

    it('uses RevenueFromContractWithCustomerExcludingAssessedTax as second fallback', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(
        mockConceptByName({
          Revenues: undefined as never,
          SalesRevenueNet: undefined as never,
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                {
                  end: '2021-12-31',
                  val: 777777,
                  fy: 2021,
                  fp: 'FY',
                  form: '10-K',
                  filed: '2022-01-01',
                  accn: '1',
                },
              ],
            },
          },
        }),
      );

      const result = await service.getMetrics('AAPL');

      expect(result.revenue?.val).toBe(777777);
    });

    it('returns null for metric when concept is not present and facts has no data', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockRejectedValue(
        new NotFoundException('No XBRL data for concept'),
      );
      edgarClient.fetchCompanyFacts.mockResolvedValue({
        cik: 320193,
        entityName: 'Apple Inc.',
        facts: { 'us-gaap': {} },
      });

      const result = await service.getMetrics('AAPL');

      expect(result.revenue).toBeNull();
      expect(result.netIncome).toBeNull();
    });

    it('falls back to companyfacts when all companyconcept calls return 404', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockRejectedValue(
        new NotFoundException('No XBRL data for concept'),
      );
      edgarClient.fetchCompanyFacts.mockResolvedValue({
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
                ],
              },
            },
          },
        },
      });

      const result = await service.getMetrics('AAPL');

      expect(result.revenue).not.toBeNull();
      expect(result.revenue?.val).toBe(383285000000);
      expect(edgarClient.fetchCompanyFacts.mock.calls).toContainEqual([
        '0000320193',
      ]);
    });

    it('picks the concept with the most recent data when Revenues has older data than RevenueFromContractWithCustomerExcludingAssessedTax', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(
        mockConceptByName({
          Revenues: {
            units: {
              USD: [
                {
                  end: '2018-09-29',
                  val: 265595000000,
                  fy: 2018,
                  fp: 'FY',
                  form: '10-K',
                  filed: '2018-11-05',
                  accn: '0000320193-18-000001',
                },
              ],
            },
          },
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                {
                  end: '2024-09-28',
                  val: 391035000000,
                  fy: 2024,
                  fp: 'FY',
                  form: '10-K',
                  filed: '2024-11-01',
                  accn: '0000320193-24-000001',
                },
              ],
            },
          },
        }),
      );

      const result = await service.getMetrics('AAPL');

      expect(result.revenue?.val).toBe(391035000000);
      expect(result.revenue?.fy).toBe(2024);
    });

    it('metrics.revenue is the single most recent data point', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(mockConceptByName());

      const result = await service.getMetrics('AAPL');

      expect(result.revenue?.end).toBe('2023-09-30');
    });

    it('resolves ticker to 10-digit CIK before calling fetchCompanyConcept', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(mockConceptByName());

      await service.getMetrics('AAPL');

      expect(
        edgarClient.fetchCompanyConcept.mock.calls.map((c) => c[0]),
      ).toContain('0000320193');
    });

    it('propagates BadGatewayException when SEC is unavailable', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockRejectedValue(
        new BadGatewayException(
          'SEC EDGAR request failed: 503 Service Unavailable',
        ),
      );

      await expect(service.getMetrics('AAPL')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('throws NotFoundException when ticker is not found', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);

      await expect(service.getMetrics('UNKN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getHistoricalMetrics', () => {
    it('returns multiple quarterly data points for revenue', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(mockConceptByName());

      const result = await service.getHistoricalMetrics('AAPL');

      expect(result.revenue.length).toBeGreaterThan(1);

      const firstRevenuePoint = result.revenue[0];

      expect(typeof firstRevenuePoint.fy).toBe('number');
      expect(typeof firstRevenuePoint.fp).toBe('string');
      expect(typeof firstRevenuePoint.end).toBe('string');
      expect(typeof firstRevenuePoint.filed).toBe('string');
      expect(typeof firstRevenuePoint.form).toBe('string');
      expect(typeof firstRevenuePoint.val).toBe('number');
    });

    it('limits historical results to 8 points', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);

      const manyPoints = Array.from({ length: 12 }, (_, i) => ({
        end: `202${Math.floor(i / 4)}-${String((i % 4) * 3 + 3).padStart(2, '0')}-30`,
        val: 100000 + i,
        fy: 2020 + Math.floor(i / 4),
        fp: `Q${(i % 4) + 1}`,
        form: '10-Q',
        filed: `202${Math.floor(i / 4)}-01-01`,
        accn: '0001234567-20-000001',
      }));

      edgarClient.fetchCompanyConcept.mockImplementation(
        mockConceptByName({
          Revenues: { units: { USD: manyPoints } },
        }),
      );

      const result = await service.getHistoricalMetrics('AAPL');

      expect(result.revenue.length).toBeLessThanOrEqual(8);
    });

    it('revenue historical points are sorted from most recent to oldest', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(mockConceptByName());

      const result = await service.getHistoricalMetrics('AAPL');

      for (let i = 0; i < result.revenue.length - 1; i++) {
        expect(result.revenue[i].end >= result.revenue[i + 1].end).toBe(true);
      }
    });

    it('picks the concept with most recent data for historical revenue', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(
        mockConceptByName({
          Revenues: {
            units: {
              USD: [
                {
                  end: '2018-09-29',
                  val: 265595000000,
                  fy: 2018,
                  fp: 'FY',
                  form: '10-K',
                  filed: '2018-11-05',
                  accn: '0000320193-18-000001',
                },
              ],
            },
          },
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                {
                  end: '2024-09-28',
                  val: 391035000000,
                  fy: 2024,
                  fp: 'FY',
                  form: '10-K',
                  filed: '2024-11-01',
                  accn: '0000320193-24-000001',
                },
              ],
            },
          },
        }),
      );

      const result = await service.getHistoricalMetrics('AAPL');

      expect(result.revenue[0].fy).toBe(2024);
      expect(result.revenue[0].val).toBe(391035000000);
    });

    it('returns empty arrays when no concept data and companyfacts is also empty', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockRejectedValue(
        new NotFoundException('No XBRL data for concept'),
      );
      edgarClient.fetchCompanyFacts.mockResolvedValue({
        cik: 320193,
        entityName: 'Apple Inc.',
        facts: { 'us-gaap': {} },
      });

      const result = await service.getHistoricalMetrics('AAPL');

      expect(result.revenue).toHaveLength(0);
      expect(result.netIncome).toHaveLength(0);
    });

    it('resolves ticker to 10-digit CIK before calling fetchCompanyConcept', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchCompanyConcept.mockImplementation(mockConceptByName());

      await service.getHistoricalMetrics('AAPL');

      expect(
        edgarClient.fetchCompanyConcept.mock.calls.map((c) => c[0]),
      ).toContain('0000320193');
    });
  });

  describe('getFilings', () => {
    it('filters out non-10-K and non-10-Q filings', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchSubmissions.mockResolvedValue(makeSubmissions());

      const result = await service.getFilings('AAPL');

      const forms = result.map((f) => f.form);
      expect(forms).not.toContain('8-K');
      expect(forms.every((f) => f === '10-K' || f === '10-Q')).toBe(true);
    });

    it('limits filings to 10 results', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);

      const manyFilings = {
        accessionNumber: Array.from(
          { length: 15 },
          (_, i) => `0000320193-24-${String(i).padStart(6, '0')}`,
        ),
        filingDate: Array.from({ length: 15 }, () => '2024-01-01'),
        form: Array.from({ length: 15 }, () => '10-Q'),
        reportDate: Array.from({ length: 15 }, () => '2023-12-31'),
        primaryDocument: Array.from({ length: 15 }, (_, i) => `doc${i}.htm`),
      };
      edgarClient.fetchSubmissions.mockResolvedValue(
        makeSubmissions(manyFilings),
      );

      const result = await service.getFilings('AAPL');

      expect(result).toHaveLength(10);
    });

    it('constructs the correct SEC link with accession number without dashes', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchSubmissions.mockResolvedValue(
        makeSubmissions({
          accessionNumber: ['0000320193-24-000123'],
          filingDate: ['2024-02-02'],
          form: ['10-K'],
          reportDate: ['2023-09-30'],
          primaryDocument: ['aapl-20230930.htm'],
        }),
      );

      const result = await service.getFilings('AAPL');

      expect(result[0].link).toBe(
        'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/aapl-20230930.htm',
      );
    });

    it('links to the filing index when primaryDocument is missing', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchSubmissions.mockResolvedValue(
        makeSubmissions({
          accessionNumber: ['0000320193-24-000123'],
          filingDate: ['2024-02-02'],
          form: ['10-K'],
          reportDate: [''],
          primaryDocument: [''],
        }),
      );

      const result = await service.getFilings('AAPL');

      expect(result[0].link).toBe(
        'https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/',
      );
      expect(result[0].primaryDocument).toBeNull();
    });

    it('resolves ticker to 10-digit CIK before calling fetchSubmissions', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);
      edgarClient.fetchSubmissions.mockResolvedValue(makeSubmissions());

      await service.getFilings('AAPL');

      expect(edgarClient.fetchSubmissions.mock.calls).toContainEqual([
        '0000320193',
      ]);
    });

    it('throws NotFoundException when ticker is not found', async () => {
      edgarClient.fetchCompanyTickers.mockResolvedValue(APPLE_TICKERS);

      await expect(service.getFilings('UNKN')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
