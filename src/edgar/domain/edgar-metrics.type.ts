export type EdgarMetricPoint = {
  fy: number;
  fp: string;
  end: string;
  filed: string;
  form: string;
  val: number;
};

export type EdgarMetrics = {
  revenue: EdgarMetricPoint | null;
  netIncome: EdgarMetricPoint | null;
  eps: EdgarMetricPoint | null;
  totalAssets: EdgarMetricPoint | null;
  totalLiabilities: EdgarMetricPoint | null;
};

export type EdgarHistoricalMetrics = {
  revenue: EdgarMetricPoint[];
  netIncome: EdgarMetricPoint[];
  eps: EdgarMetricPoint[];
  totalAssets: EdgarMetricPoint[];
  totalLiabilities: EdgarMetricPoint[];
};
