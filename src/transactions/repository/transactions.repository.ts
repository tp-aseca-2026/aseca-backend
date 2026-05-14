import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { Transaction } from '../domain/transaction.entity';

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
      orderBy: { executedAt: 'desc' },
    });
  }

  async findByUserIdAndStockId(
    userId: number,
    stockId: number,
  ): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: { userId, stockId },
    });
  }
}
