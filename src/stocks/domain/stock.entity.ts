export type Stock = {
  id: number;
  ticker: string;
  companyName: string | null;
  cik: string | null;
  createdAt: Date;
  updatedAt: Date;
};
