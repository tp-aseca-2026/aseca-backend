import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SEC_REQUEST_INTERVAL_MS = 100;

export type CompanyTickersRaw = Record<
  string,
  { cik_str: number; ticker: string; title: string }
>;

export type SubmissionsRaw = {
  cik: string;
  name: string;
  tickers: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      reportDate: string[];
      primaryDocument: string[];
    };
  };
};

export type CompanyFactsRaw = {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap'?: Record<
      string,
      {
        label: string;
        units: Record<
          string,
          Array<{
            end: string;
            val: number;
            accn: string;
            fy: number;
            fp: string;
            form: string;
            filed: string;
            frame?: string;
          }>
        >;
      }
    >;
  };
};

export type CompanyConceptRaw = {
  cik: number;
  taxonomy: string;
  tag: string;
  label: string;
  description: string;
  entityName: string;
  units: Record<
    string,
    Array<{
      end: string;
      val: number;
      accn: string;
      fy: number;
      fp: string;
      form: string;
      filed: string;
      frame?: string;
    }>
  >;
};

export type EdgarFullTextSearchRaw = {
  hits?: {
    hits?: Array<{
      _source?: {
        ciks?: string[];
        display_names?: string[];
        form?: string;
        root_forms?: string[];
      };
    }>;
  };
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

type CacheEntry<T> = { value: T; expiresAt: number };

@Injectable()
export class EdgarClient {
  private readonly userAgent: string;
  private readonly baseDataUrl = 'https://data.sec.gov';
  private readonly baseSecUrl = 'https://www.sec.gov';
  private readonly baseFullTextSearchUrl = 'https://efts.sec.gov';
  private nextAllowedRequestAt = 0;
  private rateLimitQueue = Promise.resolve();
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly configService: ConfigService) {
    this.userAgent = this.configService.get<string>(
      'SEC_USER_AGENT',
      'ASECA Portfolio Tracker contact@example.com',
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  private setCached<T>(key: string, value: T): void {
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private async get<T>(url: string): Promise<T> {
    const response = await this.fetchSec(url);

    if (!response.ok) {
      throw new BadGatewayException(
        `SEC EDGAR request failed: ${response.status} ${response.statusText}`,
      );
    }
    return response.json() as Promise<T>;
  }

  async fetchCompanyTickers(): Promise<CompanyTickersRaw> {
    const cached = this.getCached<CompanyTickersRaw>('company_tickers');
    if (cached) return cached;
    const result = await this.get<CompanyTickersRaw>(
      `${this.baseSecUrl}/files/company_tickers.json`,
    );
    this.setCached('company_tickers', result);
    return result;
  }

  async fetchSubmissions(cik: string): Promise<SubmissionsRaw> {
    const key = `submissions:${cik}`;
    const cached = this.getCached<SubmissionsRaw>(key);
    if (cached) return cached;
    const result = await this.get<SubmissionsRaw>(
      `${this.baseDataUrl}/submissions/CIK${cik}.json`,
    );
    this.setCached(key, result);
    return result;
  }

  async fetchCompanyFacts(cik: string): Promise<CompanyFactsRaw> {
    const key = `facts:${cik}`;
    const cached = this.getCached<CompanyFactsRaw>(key);
    if (cached) return cached;

    const url = `${this.baseDataUrl}/api/xbrl/companyfacts/CIK${cik}.json`;
    const response = await this.fetchSec(url);

    if (response.status === 404) {
      throw new NotFoundException(
        `No XBRL financial data available for CIK ${cik}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `SEC EDGAR request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as CompanyFactsRaw;
    this.setCached(key, result);
    return result;
  }

  async fetchCompanyConcept(
    cik: string,
    concept: string,
  ): Promise<CompanyConceptRaw> {
    const key = `concept:${cik}:${concept}`;
    const cached = this.getCached<CompanyConceptRaw>(key);
    if (cached) return cached;

    const url = `${this.baseDataUrl}/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`;
    const response = await this.fetchSec(url);

    if (response.status === 404) {
      throw new NotFoundException(
        `No XBRL data for concept ${concept} and CIK ${cik}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `SEC EDGAR request failed: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as CompanyConceptRaw;
    this.setCached(key, result);
    return result;
  }

  async fetchFullTextSearch(query: string): Promise<EdgarFullTextSearchRaw> {
    const encodedQuery = encodeURIComponent(query.trim());
    const key = `full_text_search:${encodedQuery}`;

    const cached = this.getCached<EdgarFullTextSearchRaw>(key);
    if (cached) return cached;

    const result = await this.get<EdgarFullTextSearchRaw>(
      `${this.baseFullTextSearchUrl}/LATEST/search-index?q=${encodedQuery}&forms=10-K`,
    );

    this.setCached(key, result);
    return result;
  }

  private async fetchSec(url: string): Promise<Response> {
    await this.waitForRateLimit();

    return fetch(url, {
      headers: { 'User-Agent': this.userAgent },
    });
  }

  private async waitForRateLimit(): Promise<void> {
    const previousTurn = this.rateLimitQueue;
    let releaseTurn: () => void = () => undefined;

    this.rateLimitQueue = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });

    await previousTurn;

    try {
      const delayMs = this.nextAllowedRequestAt - Date.now();

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      this.nextAllowedRequestAt = Date.now() + SEC_REQUEST_INTERVAL_MS;
    } finally {
      releaseTurn();
    }
  }
}
