import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import { PriceSnapshotsService } from '../../../src/price-snapshots/service/price-snapshots.service';
import { StocksService } from '../../../src/stocks/service/stocks.service';
import { TransactionsRepository } from '../../../src/transactions/repository/transactions.repository';
import { TransactionsService } from '../../../src/transactions/service/transactions.service';

const makeStock = (overrides = {}) => ({
  id: 10,
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  cik: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeTransaction = (overrides = {}) => ({
  id: 1,
  userId: 42,
  stockId: 10,
  type: TransactionType.BUY,
  quantity: 5,
  price: 100 as any,
  executedAt: new Date(),
  ...overrides,
});

describe('TransactionsService', () => {
  let transactionsService: TransactionsService;
  let transactionsRepository: jest.Mocked<TransactionsRepository>;
  let stocksService: jest.Mocked<StocksService>;
  let priceSnapshotsService: jest.Mocked<PriceSnapshotsService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: TransactionsRepository,
          useValue: {
            create: jest.fn(),
            findByUserId: jest.fn(),
            findByUserIdAndStockId: jest.fn(),
          },
        },
        {
          provide: StocksService,
          useValue: {
            findByTicker: jest.fn(),
          },
        },
        {
          provide: PriceSnapshotsService,
          useValue: {
            getLatestPriceForStock: jest.fn(),
          },
        },
      ],
    }).compile();

    transactionsService = moduleRef.get(TransactionsService);
    transactionsRepository = moduleRef.get(TransactionsRepository);
    stocksService = moduleRef.get(StocksService);
    priceSnapshotsService = moduleRef.get(PriceSnapshotsService);
  });

  describe('buy', () => {
    it('creates a BUY transaction for an existing ticker', async () => {
      const stock = makeStock();
      const tx = makeTransaction({ type: TransactionType.BUY });

      stocksService.findByTicker.mockResolvedValue(stock);
      priceSnapshotsService.getLatestPriceForStock.mockResolvedValue(100);
      transactionsRepository.create.mockResolvedValue(tx);

      const result = await transactionsService.buy(42, 'AAPL', 5);

      expect(transactionsRepository.create).toHaveBeenCalledWith({
        userId: 42,
        stockId: stock.id,
        type: TransactionType.BUY,
        quantity: 5,
        price: 100,
      });
      expect(result.type).toBe(TransactionType.BUY);
    });

    it('uses the latest persisted price snapshot', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      priceSnapshotsService.getLatestPriceForStock.mockResolvedValue(250.5);
      transactionsRepository.create.mockResolvedValue(
        makeTransaction({ price: 250.5 as any }),
      );

      await transactionsService.buy(42, 'AAPL', 3);

      expect(priceSnapshotsService.getLatestPriceForStock).toHaveBeenCalledWith(
        10,
        'AAPL',
      );
      expect(transactionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: 250.5 }),
      );
    });

    it('throws BadRequestException when quantity is zero', async () => {
      await expect(
        transactionsService.buy(42, 'AAPL', 0),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when quantity is negative', async () => {
      await expect(
        transactionsService.buy(42, 'AAPL', -3),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when ticker does not exist', async () => {
      stocksService.findByTicker.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(
        transactionsService.buy(42, 'NOPE', 1),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('sell', () => {
    it('creates a SELL transaction when user has sufficient shares', async () => {
      const stock = makeStock();
      stocksService.findByTicker.mockResolvedValue(stock);
      transactionsRepository.findByUserIdAndStockId.mockResolvedValue([
        makeTransaction({ type: TransactionType.BUY, quantity: 10 }),
      ]);
      priceSnapshotsService.getLatestPriceForStock.mockResolvedValue(100);
      transactionsRepository.create.mockResolvedValue(
        makeTransaction({ type: TransactionType.SELL, quantity: 4 }),
      );

      const result = await transactionsService.sell(42, 'AAPL', 4);

      expect(transactionsRepository.create).toHaveBeenCalledWith({
        userId: 42,
        stockId: stock.id,
        type: TransactionType.SELL,
        quantity: 4,
        price: 100,
      });
      expect(result.type).toBe(TransactionType.SELL);
    });

    it('throws BadRequestException when selling more than available', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      transactionsRepository.findByUserIdAndStockId.mockResolvedValue([
        makeTransaction({ type: TransactionType.BUY, quantity: 3 }),
      ]);

      await expect(
        transactionsService.sell(42, 'AAPL', 5),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('includes the available quantity in the error message', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      transactionsRepository.findByUserIdAndStockId.mockResolvedValue([
        makeTransaction({ type: TransactionType.BUY, quantity: 3 }),
      ]);

      await expect(transactionsService.sell(42, 'AAPL', 5)).rejects.toThrow(
        /3/,
      );
    });

    it('throws BadRequestException when quantity is zero', async () => {
      await expect(
        transactionsService.sell(42, 'AAPL', 0),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when quantity is negative', async () => {
      await expect(
        transactionsService.sell(42, 'AAPL', -1),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transactionsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentQuantity', () => {
    it('calculates quantity as sum of BUY minus sum of SELL', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      transactionsRepository.findByUserIdAndStockId.mockResolvedValue([
        makeTransaction({ type: TransactionType.BUY, quantity: 10 }),
        makeTransaction({ type: TransactionType.SELL, quantity: 4 }),
      ]);

      const qty = await transactionsService.getCurrentQuantity(42, 'AAPL');

      expect(qty).toBe(6);
    });

    it('returns 0 when user has no transactions for the stock', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      transactionsRepository.findByUserIdAndStockId.mockResolvedValue([]);

      const qty = await transactionsService.getCurrentQuantity(42, 'AAPL');

      expect(qty).toBe(0);
    });

    it('accumulates multiple BUY and SELL transactions correctly', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      transactionsRepository.findByUserIdAndStockId.mockResolvedValue([
        makeTransaction({ type: TransactionType.BUY, quantity: 10 }),
        makeTransaction({ type: TransactionType.BUY, quantity: 5 }),
        makeTransaction({ type: TransactionType.SELL, quantity: 3 }),
        makeTransaction({ type: TransactionType.SELL, quantity: 2 }),
      ]);

      const qty = await transactionsService.getCurrentQuantity(42, 'AAPL');

      expect(qty).toBe(10);
    });
  });

  describe('getHistory', () => {
    it('returns only transactions for the given userId', async () => {
      const userTxs = [
        makeTransaction({ id: 1, userId: 42 }),
        makeTransaction({ id: 2, userId: 42 }),
      ];
      transactionsRepository.findByUserId.mockResolvedValue(userTxs);

      const result = await transactionsService.getHistory(42);

      expect(transactionsRepository.findByUserId).toHaveBeenCalledWith(42);
      expect(result).toHaveLength(2);
      expect(result.every((tx) => tx.userId === 42)).toBe(true);
    });

    it('does not return transactions from other users', async () => {
      transactionsRepository.findByUserId.mockResolvedValue([
        makeTransaction({ id: 1, userId: 42 }),
      ]);

      const result = await transactionsService.getHistory(42);

      expect(result.every((tx) => tx.userId !== 99)).toBe(true);
    });

    it('delegates ordering to repository (findByUserId called with correct userId)', async () => {
      transactionsRepository.findByUserId.mockResolvedValue([]);

      await transactionsService.getHistory(99);

      expect(transactionsRepository.findByUserId).toHaveBeenCalledWith(99);
    });

    it('returns an empty array when user has no transactions', async () => {
      transactionsRepository.findByUserId.mockResolvedValue([]);

      const result = await transactionsService.getHistory(42);

      expect(result).toEqual([]);
    });
  });
});
