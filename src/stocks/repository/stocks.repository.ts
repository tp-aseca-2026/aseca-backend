import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { Stock } from '../domain/stock.entity';

@Injectable()
export class StocksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    ticker: string;
    companyName?: string;
    cik?: string;
  }): Promise<Stock> {
    return this.prisma.stock.create({ data });
  }

  async findByTicker(ticker: string): Promise<Stock | null> {
    return this.prisma.stock.findUnique({ where: { ticker } });
  }
}
