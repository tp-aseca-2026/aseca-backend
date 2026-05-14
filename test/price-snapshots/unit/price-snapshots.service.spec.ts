import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PriceSnapshotsRepository } from '../../../src/price-snapshots/repository/price-snapshots.repository';
import { PriceSnapshotsService } from '../../../src/price-snapshots/service/price-snapshots.service';

const makeDecimal = (value: number) =>
  ({
    toNumber: () => value,
  }) as any;

const makeStock = (overrides = {}) => ({
  id: 10,
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  cik: null,
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
  updatedAt: new Date('2026-05-01T10:00:00.000Z'),
  ...overrides,
});

const makeSnapshot = (overrides = {}) => ({
  id: 1,
  stockId: 10,
  price: makeDecimal(180.25),
  source: 'YAHOO_FINANCE',
  fetchedAt: new Date('2026-05-14T20:00:00.000Z'),
  ...overrides,
});

const makeSnapshotWithStock = (overrides = {}) => ({
  ...makeSnapshot(),
  stock: makeStock(),
  ...overrides,
});

describe('PriceSnapshotsService', () => {
  let priceSnapshotsService: PriceSnapshotsService;
  let priceSnapshotsRepository: jest.Mocked<PriceSnapshotsRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PriceSnapshotsService,
        {
          provide: PriceSnapshotsRepository,
          useValue: {
            findAllLatest: jest.fn(),
            findLastFetchedAt: jest.fn(),
            findLatestByTicker: jest.fn(),
            findLatestByStockId: jest.fn(),
          },
        },
      ],
    }).compile();

    priceSnapshotsService = moduleRef.get(PriceSnapshotsService);
    priceSnapshotsRepository = moduleRef.get(PriceSnapshotsRepository);
  });

  describe('getLatestSnapshots', () => {
    it('returns last update timestamp and latest prices', async () => {
      const fetchedAt = new Date('2026-05-14T20:00:00.000Z');
      const lastUpdatedAt = new Date('2026-05-14T20:30:00.000Z');

      priceSnapshotsRepository.findAllLatest.mockResolvedValue([
        makeSnapshotWithStock({ fetchedAt }),
      ]);
      priceSnapshotsRepository.findLastFetchedAt.mockResolvedValue(lastUpdatedAt);

      const result = await priceSnapshotsService.getLatestSnapshots();

      expect(result).toEqual({
        lastUpdatedAt,
        prices: [
          {
            ticker: 'AAPL',
            stockId: 10,
            price: expect.any(Object),
            source: 'YAHOO_FINANCE',
            fetchedAt,
          },
        ],
      });
    });

    it('returns an empty prices list when there are no snapshots', async () => {
      priceSnapshotsRepository.findAllLatest.mockResolvedValue([]);
      priceSnapshotsRepository.findLastFetchedAt.mockResolvedValue(null);

      const result = await priceSnapshotsService.getLatestSnapshots();

      expect(result).toEqual({
        lastUpdatedAt: null,
        prices: [],
      });
    });
  });

  describe('getLatestSnapshotByTicker', () => {
    it('normalizes ticker before searching', async () => {
      priceSnapshotsRepository.findLatestByTicker.mockResolvedValue(
        makeSnapshotWithStock(),
      );

      await priceSnapshotsService.getLatestSnapshotByTicker('  aapl  ');

      expect(priceSnapshotsRepository.findLatestByTicker).toHaveBeenCalledWith(
        'AAPL',
      );
    });

    it('returns latest snapshot for ticker', async () => {
      const snapshot = makeSnapshotWithStock({
        stock: makeStock({ ticker: 'MSFT' }),
        stockId: 20,
      });
      priceSnapshotsRepository.findLatestByTicker.mockResolvedValue(snapshot);

      const result = await priceSnapshotsService.getLatestSnapshotByTicker('MSFT');

      expect(result).toEqual({
        ticker: 'MSFT',
        stockId: 20,
        price: snapshot.price,
        source: 'YAHOO_FINANCE',
        fetchedAt: snapshot.fetchedAt,
      });
    });

    it('throws NotFoundException when ticker has no snapshot', async () => {
      priceSnapshotsRepository.findLatestByTicker.mockResolvedValue(null);

      await expect(
        priceSnapshotsService.getLatestSnapshotByTicker('NOPE'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getLatestPriceForStock', () => {
    it('returns latest price as number', async () => {
      priceSnapshotsRepository.findLatestByStockId.mockResolvedValue(
        makeSnapshot({ price: makeDecimal(123.45) }),
      );

      const result = await priceSnapshotsService.getLatestPriceForStock(
        10,
        'AAPL',
      );

      expect(priceSnapshotsRepository.findLatestByStockId).toHaveBeenCalledWith(
        10,
      );
      expect(result).toBe(123.45);
    });

    it('throws NotFoundException when stock has no snapshot', async () => {
      priceSnapshotsRepository.findLatestByStockId.mockResolvedValue(null);

      await expect(
        priceSnapshotsService.getLatestPriceForStock(10, 'AAPL'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
