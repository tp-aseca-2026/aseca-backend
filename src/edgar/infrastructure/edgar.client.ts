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

@Injectable()
export class EdgarClient {
  private readonly userAgent: string;
  private readonly baseDataUrl = 'https://data.sec.gov';
  private readonly baseSecUrl = 'https://www.sec.gov';
  private nextAllowedRequestAt = 0;
  private rateLimitQueue = Promise.resolve();

  constructor(private readonly configService: ConfigService) {
    this.userAgent = this.configService.get<string>(
      'SEC_USER_AGENT',
      'ASECA Portfolio Tracker contact@example.com',
    );
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
    return this.get<CompanyTickersRaw>(
      `${this.baseSecUrl}/files/company_tickers.json`,
    );
  }

  async fetchSubmissions(cik: string): Promise<SubmissionsRaw> {
    return this.get<SubmissionsRaw>(
      `${this.baseDataUrl}/submissions/CIK${cik}.json`,
    );
  }

  async fetchCompanyFacts(cik: string): Promise<CompanyFactsRaw> {
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

    return response.json() as Promise<CompanyFactsRaw>;
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
