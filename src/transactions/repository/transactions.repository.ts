import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  Transaction,
  TransactionWithStock,
} from '../domain/transaction.entity';

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId: number;
    stockId: number;
    type: TransactionType;
    quantity: number;
    price: number;
  }): Promise<Transaction> {
    return this.prisma.transaction.create({ data });
  }

  async findByUserId(userId: number): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: { userId },
      orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findByUserIdAndStockId(
    userId: number,
    stockId: number,
  ): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: { userId, stockId },
      orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findByUserIdWithStock(userId: number): Promise<TransactionWithStock[]> {
    return this.prisma.transaction.findMany({
      where: { userId },
      include: { stock: true },
      orderBy: [{ executedAt: 'asc' }, { id: 'asc' }],
    });
  }
}
