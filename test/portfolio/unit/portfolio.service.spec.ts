import { Test, TestingModule } from '@nestjs/testing';
import { TransactionType } from '@prisma/client';
import { PriceSnapshotsRepository } from '../../../src/price-snapshots/repository/price-snapshots.repository';
import { COST_BASIS_POLICY } from '../../../src/portfolio/domain/cost-basis-policy.token';
import { FifoCostBasisPolicy } from '../../../src/portfolio/domain/fifo-cost-basis-policy';
import { MISSING_PRICE_POLICY } from '../../../src/portfolio/domain/missing-price-policy.token';
import { NullMissingPricePolicy } from '../../../src/portfolio/domain/null-missing-price-policy';
import { PortfolioCalculator } from '../../../src/portfolio/domain/portfolio-calculator';
import { ROUNDING_POLICY } from '../../../src/portfolio/domain/rounding-policy.token';
import { TwoDecimalRoundingPolicy } from '../../../src/portfolio/domain/two-decimal-rounding.policy';
import { PortfolioService } from '../../../src/portfolio/service/portfolio.service';
import { TransactionsRepository } from '../../../src/transactions/repository/transactions.repository';

const decimalMock = (value: number) => ({
  toNumber: () => value,
});

const executedAt = new Date('2026-05-20T09:00:00.000Z');
const fetchedAt = new Date('2026-05-20T10:00:00.000Z');

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
        PortfolioCalculator,
        {
          provide: TransactionsRepository,
          useValue: transactionsRepository,
        },
        {
          provide: PriceSnapshotsRepository,
          useValue: priceSnapshotsRepository,
        },
        {
          provide: MISSING_PRICE_POLICY,
          useClass: NullMissingPricePolicy,
        },
        {
          provide: COST_BASIS_POLICY,
          useClass: FifoCostBasisPolicy,
        },
        {
          provide: ROUNDING_POLICY,
          useClass: TwoDecimalRoundingPolicy,
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);

    jest.clearAllMocks();
  });

  it('should build portfolio positions with latest market price', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        stockId: 1,
        quantity: 10,
        price: decimalMock(100),
        type: TransactionType.BUY,
        executedAt,
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
    ]);

    priceSnapshotsRepository.findLatestByStockId.mockResolvedValue({
      price: decimalMock(120),
      fetchedAt,
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
          unrealizedProfitLoss: 200,
          unrealizedProfitLossPercentage: 20,
          realizedProfitLoss: 0,
          totalProfitLoss: 200,
          lastPriceUpdatedAt: fetchedAt,
        },
      ],
      summary: {
        totalCostBasis: 1000,
        currentValue: 1200,
        unrealizedProfitLoss: 200,
        unrealizedProfitLossPercentage: 20,
        realizedProfitLoss: 0,
        totalProfitLoss: 200,
        lastPriceUpdatedAt: fetchedAt,
      },
    });
  });

  it('should return null market values when latest price is missing', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        stockId: 1,
        quantity: 5,
        price: decimalMock(50),
        type: TransactionType.BUY,
        executedAt,
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
      unrealizedProfitLoss: null,
      unrealizedProfitLossPercentage: null,
      realizedProfitLoss: 0,
      totalProfitLoss: null,
      lastPriceUpdatedAt: null,
    });

    expect(result.summary).toEqual({
      totalCostBasis: 250,
      currentValue: null,
      unrealizedProfitLoss: null,
      unrealizedProfitLossPercentage: null,
      realizedProfitLoss: 0,
      totalProfitLoss: null,
      lastPriceUpdatedAt: null,
    });
  });

  it('should ignore closed positions', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        stockId: 1,
        quantity: 10,
        price: decimalMock(100),
        type: TransactionType.BUY,
        executedAt: new Date('2026-05-20T09:00:00.000Z'),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        id: 2,
        userId: 1,
        stockId: 1,
        quantity: 10,
        price: decimalMock(110),
        type: TransactionType.SELL,
        executedAt: new Date('2026-05-20T09:30:00.000Z'),
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
      unrealizedProfitLoss: 0,
      unrealizedProfitLossPercentage: 0,
      realizedProfitLoss: 0,
      totalProfitLoss: 0,
      lastPriceUpdatedAt: null,
    });

    expect(priceSnapshotsRepository.findLatestByStockId).not.toHaveBeenCalled();
  });

  it('should accumulate multiple buys and sells for the same stock using FIFO', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        stockId: 1,
        quantity: 10,
        price: decimalMock(100),
        type: TransactionType.BUY,
        executedAt: new Date('2026-05-20T09:00:00.000Z'),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        id: 2,
        userId: 1,
        stockId: 1,
        quantity: 10,
        price: decimalMock(200),
        type: TransactionType.BUY,
        executedAt: new Date('2026-05-20T09:10:00.000Z'),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        id: 3,
        userId: 1,
        stockId: 1,
        quantity: 5,
        price: decimalMock(150),
        type: TransactionType.SELL,
        executedAt: new Date('2026-05-20T09:20:00.000Z'),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
    ]);

    priceSnapshotsRepository.findLatestByStockId.mockResolvedValue({
      price: decimalMock(180),
      fetchedAt,
    });

    const result = await service.getPortfolio(1);

    expect(result.positions[0]).toMatchObject({
      stockId: 1,
      ticker: 'AAPL',
      quantity: 15,
      averageBuyPrice: 166.67,
      costBasis: 2500,
      latestPrice: 180,
      currentValue: 2700,
      unrealizedProfitLoss: 200,
      unrealizedProfitLossPercentage: 8,
      realizedProfitLoss: 250,
      totalProfitLoss: 450,
    });

    expect(result.summary).toMatchObject({
      totalCostBasis: 2500,
      currentValue: 2700,
      unrealizedProfitLoss: 200,
      unrealizedProfitLossPercentage: 8,
      realizedProfitLoss: 250,
      totalProfitLoss: 450,
    });
  });

  it('should return zero profit and loss when buy, sell and latest prices are the same', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        stockId: 7,
        quantity: 10,
        price: decimalMock(180),
        type: TransactionType.BUY,
        executedAt: new Date('2026-05-20T09:00:00.000Z'),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        id: 2,
        userId: 1,
        stockId: 7,
        quantity: 10,
        price: decimalMock(180),
        type: TransactionType.BUY,
        executedAt: new Date('2026-05-20T09:10:00.000Z'),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
      {
        id: 3,
        userId: 1,
        stockId: 7,
        quantity: 5,
        price: decimalMock(180),
        type: TransactionType.SELL,
        executedAt: new Date('2026-05-20T09:20:00.000Z'),
        stock: {
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
        },
      },
    ]);

    priceSnapshotsRepository.findLatestByStockId.mockResolvedValue({
      price: decimalMock(180),
      fetchedAt,
    });

    const result = await service.getPortfolio(1);

    expect(result).toEqual({
      positions: [
        {
          stockId: 7,
          ticker: 'AAPL',
          companyName: 'Apple Inc.',
          quantity: 15,
          averageBuyPrice: 180,
          costBasis: 2700,
          latestPrice: 180,
          currentValue: 2700,
          unrealizedProfitLoss: 0,
          unrealizedProfitLossPercentage: 0,
          realizedProfitLoss: 0,
          totalProfitLoss: 0,
          lastPriceUpdatedAt: fetchedAt,
        },
      ],
      summary: {
        totalCostBasis: 2700,
        currentValue: 2700,
        unrealizedProfitLoss: 0,
        unrealizedProfitLossPercentage: 0,
        realizedProfitLoss: 0,
        totalProfitLoss: 0,
        lastPriceUpdatedAt: fetchedAt,
      },
    });
  });

  it('should calculate unrealized loss when latest price is below cost basis', async () => {
    transactionsRepository.findByUserIdWithStock.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        stockId: 8,
        quantity: 10,
        price: decimalMock(100),
        type: TransactionType.BUY,
        executedAt,
        stock: {
          ticker: 'NFLX',
          companyName: 'Netflix Inc.',
        },
      },
    ]);

    priceSnapshotsRepository.findLatestByStockId.mockResolvedValue({
      price: decimalMock(80),
      fetchedAt,
    });

    const result = await service.getPortfolio(1);

    expect(result).toEqual({
      positions: [
        {
          stockId: 8,
          ticker: 'NFLX',
          companyName: 'Netflix Inc.',
          quantity: 10,
          averageBuyPrice: 100,
          costBasis: 1000,
          latestPrice: 80,
          currentValue: 800,
          unrealizedProfitLoss: -200,
          unrealizedProfitLossPercentage: -20,
          realizedProfitLoss: 0,
          totalProfitLoss: -200,
          lastPriceUpdatedAt: fetchedAt,
        },
      ],
      summary: {
        totalCostBasis: 1000,
        currentValue: 800,
        unrealizedProfitLoss: -200,
        unrealizedProfitLossPercentage: -20,
        realizedProfitLoss: 0,
        totalProfitLoss: -200,
        lastPriceUpdatedAt: fetchedAt,
      },
    });
  });
});
