export type PortfolioPosition = {
  stockId: number;
  ticker: string;
  companyName: string | null;
  quantity: number;
  averageBuyPrice: number;
  costBasis: number;
  latestPrice: number | null;
  currentValue: number | null;
  unrealizedProfitLoss: number | null;
  unrealizedProfitLossPercentage: number | null;
  realizedProfitLoss: number;
  totalProfitLoss: number | null;
  lastPriceUpdatedAt: Date | null;
};

export type PortfolioSummary = {
  totalCostBasis: number;
  currentValue: number | null;
  unrealizedProfitLoss: number | null;
  unrealizedProfitLossPercentage: number | null;
  realizedProfitLoss: number;
  totalProfitLoss: number | null;
  lastPriceUpdatedAt: Date | null;
};

export type PortfolioResponse = {
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
};
