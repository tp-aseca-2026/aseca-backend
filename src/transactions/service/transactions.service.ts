import { BadRequestException, Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PriceSnapshotsService } from '../../price-snapshots/service/price-snapshots.service';
import { StocksService } from '../../stocks/service/stocks.service';
import type { Transaction } from '../domain/transaction.entity';
import { TransactionsRepository } from '../repository/transactions.repository';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly stocksService: StocksService,
    private readonly priceSnapshotsService: PriceSnapshotsService,
  ) {}

  async buy(userId: number, ticker: string, quantity: number): Promise<Transaction> {
    this.validateQuantity(quantity);

    const stock = await this.stocksService.findByTicker(ticker);
    const price = await this.priceSnapshotsService.getLatestPriceForStock(
      stock.id,
      stock.ticker,
    );

    return this.transactionsRepository.create({
      userId,
      stockId: stock.id,
      type: TransactionType.BUY,
      quantity,
      price,
    });
  }

  async sell(userId: number, ticker: string, quantity: number): Promise<Transaction> {
    this.validateQuantity(quantity);

    const stock = await this.stocksService.findByTicker(ticker);
    const available = await this.calculateCurrentQuantity(userId, stock.id);

    if (quantity > available) {
      throw new BadRequestException(
        `Cannot sell ${quantity} shares. You currently hold ${available} shares.`,
      );
    }

    const price = await this.priceSnapshotsService.getLatestPriceForStock(
      stock.id,
      stock.ticker,
    );

    return this.transactionsRepository.create({
      userId,
      stockId: stock.id,
      type: TransactionType.SELL,
      quantity,
      price,
    });
  }

  async getHistory(userId: number): Promise<Transaction[]> {
    return this.transactionsRepository.findByUserId(userId);
  }

  async getCurrentQuantity(userId: number, ticker: string): Promise<number> {
    const stock = await this.stocksService.findByTicker(ticker);
    return this.calculateCurrentQuantity(userId, stock.id);
  }

  private async calculateCurrentQuantity(
    userId: number,
    stockId: number,
  ): Promise<number> {
    const transactions = await this.transactionsRepository.findByUserIdAndStockId(
      userId,
      stockId,
    );

    return transactions.reduce((total, tx) => {
      return tx.type === TransactionType.BUY
        ? total + tx.quantity
        : total - tx.quantity;
    }, 0);
  }

  private validateQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive integer');
    }
  }
}
