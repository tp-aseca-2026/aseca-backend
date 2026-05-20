import { Test, TestingModule } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import { PortfolioService } from '../../../src/portfolio/service/portfolio.service';
import { TransactionsRepository } from '../../../src/transactions/repository/transactions.repository';
import { PriceSnapshotsRepository } from '../../../src/price-snapshots/repository/price-snapshots.repository';

const decimalMock = (value: number) => ({
  toNumber: () => value,
});

describe('PortfolioService', () => {
  let service: PortfolioService;

  const transactionsRepository = {
    findByUserIdWithStock: jest.fn(),
  };

  const priceSnapshotsRepository = {
    findLatestByStockId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: TransactionsRepository,
          useValue: transactionsRepository,
        },
        {
          provide: PriceSnapshotsRepository,
          useValue: priceSnapshotsRepository,
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);

    jest.clearAllMocks();
  });

  it('should build portfolio positions with latest market price', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        stockId: 1,
        quantity: 10,
        price: decimalMock(100),
        type: TransactionType.BUY,
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
    ]);

    priceSnapshotsRepository.findLatestByStockId.mockResolvedValue({
      price: decimalMock(120),
      fetchedAt: new Date('2026-05-20T10:00:00.000Z'),
    });

    const result = await service.getPortfolio(1);

    expect(result).toEqual({
      positions: [
        {
          stockId: 1,
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 10,
          averageBuyPrice: 100,
          costBasis: 1000,
          latestPrice: 120,
          currentValue: 1200,
          profitLoss: 200,
          profitLossPercentage: 20,
          lastPriceUpdatedAt: new Date('2026-05-20T10:00:00.000Z'),
        },
      ],
      summary: {
        totalCostBasis: 1000,
        currentValue: 1200,
        profitLoss: 200,
        profitLossPercentage: 20,
        lastPriceUpdatedAt: new Date('2026-05-20T10:00:00.000Z'),
      },
    });
  });

  it('should return null market values when latest price is missing', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        stockId: 1,
        quantity: 5,
        price: decimalMock(50),
        type: TransactionType.BUY,
        stock: {
          ticker: 'MSFT',
          companyName: 'Microsoft',
        },
      },
    ]);

    priceSnapshotsRepository.findLatestByStockId.mockResolvedValue(null);

    const result = await service.getPortfolio(1);

    expect(result.positions[0]).toEqual({
      stockId: 1,
      ticker: 'MSFT',
      companyName: 'Microsoft',
      quantity: 5,
      averageBuyPrice: 50,
      costBasis: 250,
      latestPrice: null,
      currentValue: null,
      profitLoss: null,
      profitLossPercentage: null,
      lastPriceUpdatedAt: null,
    });

    expect(result.summary).toEqual({
      totalCostBasis: 250,
      currentValue: null,
      profitLoss: null,
      profitLossPercentage: null,
      lastPriceUpdatedAt: null,
    });
  });

  it('should ignore closed positions', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        stockId: 1,
        quantity: 10,
        price: decimalMock(100),
        type: TransactionType.BUY,
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        stockId: 1,
        quantity: 10,
        price: decimalMock(110),
        type: TransactionType.SELL,
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
    ]);

    const result = await service.getPortfolio(1);

    expect(result.positions).toEqual([]);
    expect(result.summary).toEqual({
      totalCostBasis: 0,
      currentValue: 0,
      profitLoss: 0,
      profitLossPercentage: 0,
      lastPriceUpdatedAt: null,
    });

    expect(priceSnapshotsRepository.findLatestByStockId).not.toHaveBeenCalled();
  });

  it('should accumulate multiple buys and sells for the same stock', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        stockId: 1,
        quantity: 10,
        price: decimalMock(100),
        type: TransactionType.BUY,
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        stockId: 1,
        quantity: 10,
        price: decimalMock(200),
        type: TransactionType.BUY,
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        stockId: 1,
        quantity: 5,
        price: decimalMock(150),
        type: TransactionType.SELL,
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
    ]);

    priceSnapshotsRepository.findLatestByStockId.mockResolvedValue({
      price: decimalMock(180),
      fetchedAt: new Date('2026-05-20T10:00:00.000Z'),
    });

    const result = await service.getPortfolio(1);

    expect(result.positions[0]).toMatchObject({
      stockId: 1,
      ticker: 'AAPL',
      quantity: 15,
      averageBuyPrice: 150,
      costBasis: 2250,
      latestPrice: 180,
      currentValue: 2700,
      profitLoss: 450,
      profitLossPercentage: 20,
    });

    expect(result.summary).toMatchObject({
      totalCostBasis: 2250,
      currentValue: 2700,
      profitLoss: 450,
      profitLossPercentage: 20,
    });
  });
});
