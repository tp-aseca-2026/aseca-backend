export type PortfolioPosition = {
  stockId: number;
  ticker: string;
  companyName: string | null;
  quantity: number;
  averageBuyPrice: number;
  costBasis: number;
  latestPrice: number | null;
  currentValue: number | null;
  profitLoss: number | null;
  profitLossPercentage: number | null;
  lastPriceUpdatedAt: Date | null;
};

export type PortfolioSummary = {
  totalCostBasis: number;
  currentValue: number | null;
  profitLoss: number | null;
  profitLossPercentage: number | null;
  lastPriceUpdatedAt: Date | null;
};

export type PortfolioResponse = {
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
};
