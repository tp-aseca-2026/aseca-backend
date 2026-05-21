import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  constructor(private readonly configService: ConfigService) {
    this.userAgent = this.configService.get<string>(
      'SEC_USER_AGENT',
      'ASECA Portfolio Tracker contact@example.com',
    );
  }

  private async get<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: { 'User-Agent': this.userAgent },
    });
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
    const response = await fetch(url, {
      headers: { 'User-Agent': this.userAgent },
    });

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
}
