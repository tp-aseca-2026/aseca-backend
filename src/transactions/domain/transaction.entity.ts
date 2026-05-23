import type { Prisma, TransactionType } from '@prisma/client';

export type Transaction = {
  id: number;
  userId: number;
  stockId: number;
  type: TransactionType;
  quantity: number;
  price: Prisma.Decimal;
  executedAt: Date;
};

export type TransactionWithStock = Transaction & {
  stock: {
    ticker: string;
    companyName: string | null;
  };
};

export { TransactionType };
