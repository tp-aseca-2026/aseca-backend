import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EdgarClient } from '../../../src/edgar/infrastructure/edgar.client';

describe('EdgarClient', () => {
  let client: EdgarClient;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  const mockFetchResponse = (response: Partial<Response>): Response =>
    response as Response;

  const getFirstFetchRequestInit = (): RequestInit => {
    const [, requestInit] = fetchSpy.mock.calls[0] as [
      RequestInfo | URL,
      RequestInit,
    ];

    return requestInit;
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EdgarClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('TestAgent test@example.com'),
          },
        },
      ],
    }).compile();

    client = moduleRef.get<EdgarClient>(EdgarClient);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.useRealTimers();
    fetchSpy.mockRestore();
  });

  describe('User-Agent header', () => {
    it('adds User-Agent header to all requests', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          ok: true,
          json: jest.fn().mockResolvedValue({}),
        }),
      );

      await client.fetchCompanyTickers();

      const requestInit = getFirstFetchRequestInit();
      const headers = requestInit.headers as Record<string, string>;

      expect(headers['User-Agent']).toBe('TestAgent test@example.com');
    });
  });

  describe('URL construction', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          ok: true,
          json: jest.fn().mockResolvedValue({}),
        }),
      );
    });

    it('calls the correct SEC URL for company tickers', async () => {
      await client.fetchCompanyTickers();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://www.sec.gov/files/company_tickers.json',
        expect.any(Object),
      );
    });

    it('calls the correct SEC URL for submissions with CIK prefix', async () => {
      await client.fetchSubmissions('0000320193');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://data.sec.gov/submissions/CIK0000320193.json',
        expect.any(Object),
      );
    });

    it('calls the correct SEC URL for companyfacts with CIK prefix', async () => {
      await client.fetchCompanyFacts('0000320193');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',
        expect.any(Object),
      );
    });
  });

  describe('error handling', () => {
    it('throws BadGatewayException on HTTP 404 response', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      );

      await expect(client.fetchCompanyTickers()).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('throws BadGatewayException on HTTP 500 response', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      await expect(
        client.fetchSubmissions('0000320193'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('fetchCompanyFacts error handling', () => {
    it('throws NotFoundException when SEC returns 404 for companyfacts', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      );

      await expect(
        client.fetchCompanyFacts('0000320193'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadGatewayException when SEC returns 500 for companyfacts', async () => {
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      );

      await expect(
        client.fetchCompanyFacts('0000320193'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });

  describe('rate limit', () => {
    it('waits at least 100ms before starting the next SEC request', async () => {
      jest.useFakeTimers();
      fetchSpy.mockResolvedValue(
        mockFetchResponse({
          ok: true,
          json: jest.fn().mockResolvedValue({}),
        }),
      );

      const firstRequest = client.fetchCompanyTickers();
      await jest.advanceTimersByTimeAsync(0);

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const secondRequest = client.fetchSubmissions('0000320193');
      await jest.advanceTimersByTimeAsync(99);

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      await Promise.all([firstRequest, secondRequest]);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('in-memory cache', () => {
    const successResponse = (data: unknown) =>
      mockFetchResponse({
        ok: true,
        json: jest.fn().mockResolvedValue(data),
      });

    it('returns cached company tickers without calling fetch again', async () => {
      fetchSpy.mockResolvedValue(
        successResponse({
          '0': { cik_str: 1, ticker: 'AAPL', title: 'Apple' },
        }),
      );

      await client.fetchCompanyTickers();
      await client.fetchCompanyTickers();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns cached submissions without calling fetch again', async () => {
      fetchSpy.mockResolvedValue(
        successResponse({
          cik: '0000320193',
          name: 'Apple',
          tickers: [],
          filings: { recent: {} },
        }),
      );

      await client.fetchSubmissions('0000320193');
      await client.fetchSubmissions('0000320193');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('returns cached company facts without calling fetch again', async () => {
      fetchSpy.mockResolvedValue(
        successResponse({ cik: 320193, entityName: 'Apple', facts: {} }),
      );

      await client.fetchCompanyFacts('0000320193');
      await client.fetchCompanyFacts('0000320193');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('fetches again after cache expires', async () => {
      jest.useFakeTimers();
      fetchSpy.mockResolvedValue(
        successResponse({
          '0': { cik_str: 1, ticker: 'AAPL', title: 'Apple' },
        }),
      );

      await client.fetchCompanyTickers();
      jest.advanceTimersByTime(61 * 60 * 1000); // advance past 1 hour TTL
      await client.fetchCompanyTickers();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('fetches different CIKs independently', async () => {
      fetchSpy.mockResolvedValue(
        successResponse({ cik: 0, entityName: 'X', facts: {} }),
      );

      await client.fetchCompanyFacts('0000000001');
      await client.fetchCompanyFacts('0000000002');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
