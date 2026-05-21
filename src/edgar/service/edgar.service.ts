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
  type CompanyFactsRaw,
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

const MAX_SEARCH_RESULTS = 10;
const MAX_FILINGS = 10;
const MAX_HISTORICAL_POINTS = 8;
const ALLOWED_FILING_FORMS = ['10-K', '10-Q'];
const ALLOWED_METRIC_FORMS = ['10-K', '10-Q'];

@Injectable()
export class EdgarService {
  constructor(private readonly edgarClient: EdgarClient) {}

  async searchCompanies(query: string): Promise<EdgarCompany[]> {
    const normalized = query.trim().toLowerCase();
    const tickers = await this.edgarClient.fetchCompanyTickers();

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
    const facts = await this.fetchFactsForTicker(company.cik, ticker);

    return {
      revenue: this.getRevenuePoints(facts)[0] ?? null,
      netIncome: this.getNetIncomePoints(facts)[0] ?? null,
      eps: this.getEpsPoints(facts)[0] ?? null,
      totalAssets: this.getAssetsPoints(facts)[0] ?? null,
      totalLiabilities: this.getLiabilitiesPoints(facts)[0] ?? null,
    };
  }

  async getHistoricalMetrics(ticker: string): Promise<EdgarHistoricalMetrics> {
    const company = await this.findByTicker(ticker);
    const facts = await this.fetchFactsForTicker(company.cik, ticker);

    return {
      revenue: this.getRevenuePoints(facts).slice(0, MAX_HISTORICAL_POINTS),
      netIncome: this.getNetIncomePoints(facts).slice(0, MAX_HISTORICAL_POINTS),
      eps: this.getEpsPoints(facts).slice(0, MAX_HISTORICAL_POINTS),
      totalAssets: this.getAssetsPoints(facts).slice(0, MAX_HISTORICAL_POINTS),
      totalLiabilities: this.getLiabilitiesPoints(facts).slice(
        0,
        MAX_HISTORICAL_POINTS,
      ),
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

  private async fetchFactsForTicker(
    cik: string,
    ticker: string,
  ): Promise<CompanyFactsRaw> {
    return this.edgarClient.fetchCompanyFacts(cik).catch((err: unknown) => {
      if (err instanceof NotFoundException) {
        throw new NotFoundException(
          `No XBRL financial data found for ticker ${ticker}`,
        );
      }
      throw err;
    });
  }

  private getRevenuePoints(facts: CompanyFactsRaw): EdgarMetricPoint[] {
    const gaap = facts.facts['us-gaap'];
    if (!gaap) return [];

    const candidates = (
      [
        gaap['Revenues'],
        gaap['SalesRevenueNet'],
        gaap['RevenueFromContractWithCustomerExcludingAssessedTax'],
      ] as Array<ConceptData | undefined>
    ).filter((c): c is ConceptData => c != null);

    return this.pickMostRecentConceptPoints(candidates, 'USD');
  }

  private getNetIncomePoints(facts: CompanyFactsRaw): EdgarMetricPoint[] {
    const gaap = facts.facts['us-gaap'];
    if (!gaap) return [];
    const concept = gaap['NetIncomeLoss'] as ConceptData | undefined;
    if (!concept) return [];
    return this.extractPoints(concept, 'USD');
  }

  private getEpsPoints(facts: CompanyFactsRaw): EdgarMetricPoint[] {
    const gaap = facts.facts['us-gaap'];
    if (!gaap) return [];
    const concept = (gaap['EarningsPerShareDiluted'] ??
      gaap['EarningsPerShareBasic']) as ConceptData | undefined;
    if (!concept) return [];
    const unit = concept.units['USD/shares'] ? 'USD/shares' : 'USD';
    return this.extractPoints(concept, unit);
  }

  private getAssetsPoints(facts: CompanyFactsRaw): EdgarMetricPoint[] {
    const gaap = facts.facts['us-gaap'];
    if (!gaap) return [];
    const concept = gaap['Assets'] as ConceptData | undefined;
    if (!concept) return [];
    return this.extractPoints(concept, 'USD');
  }

  private getLiabilitiesPoints(facts: CompanyFactsRaw): EdgarMetricPoint[] {
    const gaap = facts.facts['us-gaap'];
    if (!gaap) return [];
    const concept = gaap['Liabilities'] as ConceptData | undefined;
    if (!concept) return [];
    return this.extractPoints(concept, 'USD');
  }

  private pickMostRecentConceptPoints(
    candidates: ConceptData[],
    unit: string,
  ): EdgarMetricPoint[] {
    let bestPoints: EdgarMetricPoint[] = [];

    for (const concept of candidates) {
      const points = this.extractPoints(concept, unit);
      if (
        points.length > 0 &&
        (bestPoints.length === 0 || points[0].end > bestPoints[0].end)
      ) {
        bestPoints = points;
      }
    }

    return bestPoints;
  }

  private extractPoints(
    concept: ConceptData,
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
