import { Injectable, NotFoundException } from '@nestjs/common';
import type { EdgarCompany } from '../domain/edgar-company.type';
import type { EdgarFiling } from '../domain/edgar-filing.type';
import type {
  EdgarHistoricalMetrics,
  EdgarMetricPoint,
  EdgarMetrics,
} from '../domain/edgar-metrics.type';
import {
  EdgarClient,
  type CompanyConceptRaw,
  EdgarFullTextSearchRaw,
  CompanyTickersRaw,
} from '../infrastructure/edgar.client';

type ConceptData = {
  units: Record<
    string,
    Array<{
      end: string;
      val: number;
      fy: number;
      fp: string;
      form: string;
      filed: string;
    }>
  >;
};

type MetricPoints = {
  revenue: EdgarMetricPoint[];
  netIncome: EdgarMetricPoint[];
  eps: EdgarMetricPoint[];
  totalAssets: EdgarMetricPoint[];
  totalLiabilities: EdgarMetricPoint[];
};

const MAX_SEARCH_RESULTS = 10;
const MAX_FILINGS = 10;
const MAX_HISTORICAL_POINTS = 8;
const ALLOWED_FILING_FORMS = ['10-K', '10-Q'];
const ALLOWED_METRIC_FORMS = ['10-K', '10-Q'];

@Injectable()
export class EdgarService {
  constructor(private readonly edgarClient: EdgarClient) {}

  async searchCompanies(query: string): Promise<EdgarCompany[]> {
    const [fullTextResults, tickers] = await Promise.all([
      this.edgarClient.fetchFullTextSearch(query),
      this.edgarClient.fetchCompanyTickers(),
    ]);

    const fullTextCompanies = this.extractCompaniesFromFullTextSearch(
      fullTextResults,
      tickers,
    );

    if (fullTextCompanies.length > 0) {
      return fullTextCompanies.slice(0, MAX_SEARCH_RESULTS);
    }

    return this.searchCompaniesFromTickerMap(query, tickers);
  }

  async getFilings(ticker: string): Promise<EdgarFiling[]> {
    const company = await this.findByTicker(ticker);
    const submissions = await this.edgarClient.fetchSubmissions(company.cik);

    const recent = submissions.filings.recent;
    const filings: EdgarFiling[] = [];
    const cikNoZeros = String(parseInt(company.cik, 10));

    for (let i = 0; i < recent.form.length; i++) {
      if (!ALLOWED_FILING_FORMS.includes(recent.form[i])) continue;

      const accessionNumber = recent.accessionNumber[i];
      const accNoGuiones = accessionNumber.replace(/-/g, '');
      const primaryDocument = recent.primaryDocument[i] || null;

      const link = primaryDocument
        ? `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accNoGuiones}/${primaryDocument}`
        : `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accNoGuiones}/`;

      filings.push({
        form: recent.form[i],
        filingDate: recent.filingDate[i],
        accessionNumber,
        reportDate: recent.reportDate[i] || null,
        primaryDocument,
        link,
      });

      if (filings.length >= MAX_FILINGS) break;
    }

    return filings;
  }

  async getMetrics(ticker: string): Promise<EdgarMetrics> {
    const company = await this.findByTicker(ticker);
    const points = await this.fetchAllMetricPoints(company.cik, ticker);
    return {
      revenue: points.revenue[0] ?? null,
      netIncome: points.netIncome[0] ?? null,
      eps: points.eps[0] ?? null,
      totalAssets: points.totalAssets[0] ?? null,
      totalLiabilities: points.totalLiabilities[0] ?? null,
    };
  }

  async getHistoricalMetrics(ticker: string): Promise<EdgarHistoricalMetrics> {
    const company = await this.findByTicker(ticker);
    const points = await this.fetchAllMetricPoints(company.cik, ticker);
    return {
      revenue: points.revenue.slice(0, MAX_HISTORICAL_POINTS),
      netIncome: points.netIncome.slice(0, MAX_HISTORICAL_POINTS),
      eps: points.eps.slice(0, MAX_HISTORICAL_POINTS),
      totalAssets: points.totalAssets.slice(0, MAX_HISTORICAL_POINTS),
      totalLiabilities: points.totalLiabilities.slice(0, MAX_HISTORICAL_POINTS),
    };
  }

  private async findByTicker(ticker: string): Promise<EdgarCompany> {
    const normalized = ticker.trim().toUpperCase();
    const tickers = await this.edgarClient.fetchCompanyTickers();

    for (const entry of Object.values(tickers)) {
      if (entry.ticker.toUpperCase() === normalized) {
        return {
          companyName: entry.title,
          ticker: entry.ticker,
          cik: this.normalizeCik(entry.cik_str),
        };
      }
    }

    throw new NotFoundException(`Company with ticker ${normalized} not found`);
  }

  private normalizeCik(cik: number | string): string {
    return String(cik).padStart(10, '0');
  }

  private async fetchAllMetricPoints(
    cik: string,
    ticker: string,
  ): Promise<MetricPoints> {
    const [revenue, netIncome, eps, totalAssets, totalLiabilities] =
      await Promise.all([
        this.fetchRevenuePoints(cik),
        this.fetchConceptPoints(cik, 'NetIncomeLoss', 'USD'),
        this.fetchEpsPoints(cik),
        this.fetchConceptPoints(cik, 'Assets', 'USD'),
        this.fetchConceptPoints(cik, 'Liabilities', 'USD'),
      ]);

    if (
      [revenue, netIncome, eps, totalAssets, totalLiabilities].every(
        (p) => p.length === 0,
      )
    ) {
      return this.fetchAllMetricPointsFromFacts(cik, ticker);
    }

    return { revenue, netIncome, eps, totalAssets, totalLiabilities };
  }

  private async fetchAllMetricPointsFromFacts(
    cik: string,
    ticker: string,
  ): Promise<MetricPoints> {
    const facts = await this.edgarClient
      .fetchCompanyFacts(cik)
      .catch((err: unknown) => {
        if (err instanceof NotFoundException) {
          throw new NotFoundException(
            `No XBRL financial data found for ticker ${ticker}`,
          );
        }
        throw err;
      });

    const gaap = facts.facts['us-gaap'] ?? {};

    const fromGaap = (concept: string, unit: string): EdgarMetricPoint[] => {
      const data = gaap[concept] as ConceptData | undefined;
      return data ? this.extractPoints(data, unit) : [];
    };

    const epsData = (gaap['EarningsPerShareDiluted'] ??
      gaap['EarningsPerShareBasic']) as ConceptData | undefined;
    const epsUnit = epsData?.units['USD/shares'] ? 'USD/shares' : 'USD';

    return {
      revenue: this.pickMostRecentPoints([
        fromGaap('Revenues', 'USD'),
        fromGaap('SalesRevenueNet', 'USD'),
        fromGaap('RevenueFromContractWithCustomerExcludingAssessedTax', 'USD'),
      ]),
      netIncome: fromGaap('NetIncomeLoss', 'USD'),
      eps: epsData ? this.extractPoints(epsData, epsUnit) : [],
      totalAssets: fromGaap('Assets', 'USD'),
      totalLiabilities: fromGaap('Liabilities', 'USD'),
    };
  }

  private async fetchConceptPoints(
    cik: string,
    concept: string,
    unit: string,
  ): Promise<EdgarMetricPoint[]> {
    try {
      const data = await this.edgarClient.fetchCompanyConcept(cik, concept);
      return this.extractPoints(data, unit);
    } catch (err) {
      if (err instanceof NotFoundException) return [];
      throw err;
    }
  }

  private async fetchRevenuePoints(cik: string): Promise<EdgarMetricPoint[]> {
    const results = await Promise.all([
      this.fetchConceptPoints(cik, 'Revenues', 'USD'),
      this.fetchConceptPoints(cik, 'SalesRevenueNet', 'USD'),
      this.fetchConceptPoints(
        cik,
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'USD',
      ),
    ]);
    return this.pickMostRecentPoints(results);
  }

  private async fetchEpsPoints(cik: string): Promise<EdgarMetricPoint[]> {
    for (const concept of [
      'EarningsPerShareDiluted',
      'EarningsPerShareBasic',
    ]) {
      try {
        const data = await this.edgarClient.fetchCompanyConcept(cik, concept);
        const unit = data.units['USD/shares'] ? 'USD/shares' : 'USD';
        return this.extractPoints(data, unit);
      } catch (err) {
        if (!(err instanceof NotFoundException)) throw err;
      }
    }
    return [];
  }

  private pickMostRecentPoints(
    pointLists: EdgarMetricPoint[][],
  ): EdgarMetricPoint[] {
    let best: EdgarMetricPoint[] = [];
    for (const points of pointLists) {
      if (
        points.length > 0 &&
        (best.length === 0 || points[0].end > best[0].end)
      ) {
        best = points;
      }
    }
    return best;
  }

  private extractCompaniesFromFullTextSearch(
    raw: EdgarFullTextSearchRaw,
    tickers: CompanyTickersRaw,
  ): EdgarCompany[] {
    const tickerEntriesByCik = this.buildTickerEntriesByCik(tickers);
    const results = new Map<string, EdgarCompany>();

    for (const hit of raw.hits?.hits ?? []) {
      const source = hit._source;
      if (!source) continue;

      for (const rawCik of source.ciks ?? []) {
        const cik = this.normalizeCik(rawCik);
        const tickerEntry = tickerEntriesByCik.get(cik);

        if (!tickerEntry || results.has(cik)) continue;

        results.set(cik, {
          companyName: tickerEntry.title,
          ticker: tickerEntry.ticker,
          cik,
        });

        if (results.size >= MAX_SEARCH_RESULTS) {
          return Array.from(results.values());
        }
      }
    }

    return Array.from(results.values());
  }

  private buildTickerEntriesByCik(
    tickers: CompanyTickersRaw,
  ): Map<string, { cik_str: number; ticker: string; title: string }> {
    const entriesByCik = new Map<
      string,
      { cik_str: number; ticker: string; title: string }
    >();

    for (const entry of Object.values(tickers)) {
      entriesByCik.set(this.normalizeCik(entry.cik_str), entry);
    }

    return entriesByCik;
  }

  private searchCompaniesFromTickerMap(
    query: string,
    tickers: CompanyTickersRaw,
  ): EdgarCompany[] {
    const normalized = query.trim().toLowerCase();

    const results: EdgarCompany[] = [];

    for (const entry of Object.values(tickers)) {
      if (
        entry.title.toLowerCase().includes(normalized) ||
        entry.ticker.toLowerCase().includes(normalized)
      ) {
        results.push({
          companyName: entry.title,
          ticker: entry.ticker,
          cik: this.normalizeCik(entry.cik_str),
        });
      }

      if (results.length >= MAX_SEARCH_RESULTS) break;
    }

    return results;
  }

  private extractPoints(
    concept: ConceptData | CompanyConceptRaw,
    unit: string,
  ): EdgarMetricPoint[] {
    const unitData = concept.units[unit];
    if (!Array.isArray(unitData)) return [];

    const filtered = unitData.filter((p) =>
      ALLOWED_METRIC_FORMS.includes(p.form),
    );

    const sorted = [...filtered].sort((a, b) => {
      const endCmp = b.end.localeCompare(a.end);
      if (endCmp !== 0) return endCmp;
      return b.filed.localeCompare(a.filed);
    });

    const seen = new Set<string>();
    return sorted
      .filter((p) => {
        if (seen.has(p.end)) return false;
        seen.add(p.end);
        return true;
      })
      .map((p) => ({
        fy: p.fy,
        fp: p.fp,
        end: p.end,
        filed: p.filed,
        form: p.form,
        val: p.val,
      }));
  }
}
