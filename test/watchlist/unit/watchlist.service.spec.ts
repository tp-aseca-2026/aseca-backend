import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StocksService } from '../../../src/stocks/service/stocks.service';
import { WatchlistRepository } from '../../../src/watchlist/repository/watchlist.repository';
import { WatchlistService } from '../../../src/watchlist/service/watchlist.service';

const makeStock = (overrides = {}) => ({
  id: 10,
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  cik: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeWatchlistItem = (overrides = {}) => ({
  id: 1,
  userId: 42,
  stockId: 10,
  createdAt: new Date(),
  ...overrides,
});

const makeWatchlistItemWithStock = (overrides = {}) => ({
  ...makeWatchlistItem(),
  stock: makeStock(),
  ...overrides,
});

describe('WatchlistService', () => {
  let watchlistService: WatchlistService;
  let watchlistRepository: jest.Mocked<WatchlistRepository>;
  let stocksService: jest.Mocked<StocksService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WatchlistService,
        {
          provide: WatchlistRepository,
          useValue: {
            create: jest.fn(),
            findByUserId: jest.fn(),
            findByUserIdAndStockId: jest.fn(),
            deleteById: jest.fn(),
          },
        },
        {
          provide: StocksService,
          useValue: {
            findByTicker: jest.fn(),
          },
        },
      ],
    }).compile();

    watchlistService = moduleRef.get(WatchlistService);
    watchlistRepository = moduleRef.get(WatchlistRepository);
    stocksService = moduleRef.get(StocksService);
  });

  describe('getWatchlist', () => {
    it('returns watchlist items for the authenticated user', async () => {
      const items = [
        makeWatchlistItemWithStock(),
        makeWatchlistItemWithStock({
          id: 2,
          stockId: 11,
          stock: makeStock({ id: 11, ticker: 'MSFT' }),
        }),
      ];
      watchlistRepository.findByUserId.mockResolvedValue(items);

      const result = await watchlistService.getWatchlist(42);

      expect(watchlistRepository.findByUserId.mock.calls).toEqual([[42]]);
      expect(result).toEqual(items);
    });

    it('returns an empty array when the user has no watchlist items', async () => {
      watchlistRepository.findByUserId.mockResolvedValue([]);

      const result = await watchlistService.getWatchlist(42);

      expect(result).toEqual([]);
    });
  });

  describe('add', () => {
    it('adds an existing stock to the authenticated user watchlist', async () => {
      const stock = makeStock();
      const item = makeWatchlistItemWithStock({ stock });
      stocksService.findByTicker.mockResolvedValue(stock);
      watchlistRepository.findByUserIdAndStockId.mockResolvedValue(null);
      watchlistRepository.create.mockResolvedValue(item);

      const result = await watchlistService.add(42, 'aapl');

      expect(stocksService.findByTicker.mock.calls).toEqual([['aapl']]);
      expect(watchlistRepository.findByUserIdAndStockId.mock.calls).toEqual([
        [42, 10],
      ]);
      expect(watchlistRepository.create.mock.calls).toEqual([[42, 10]]);
      expect(result).toEqual(item);
    });

    it('throws ConflictException when the stock is already in the user watchlist', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      watchlistRepository.findByUserIdAndStockId.mockResolvedValue(
        makeWatchlistItem(),
      );

      await expect(watchlistService.add(42, 'AAPL')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(watchlistRepository.create.mock.calls).toHaveLength(0);
    });

    it('propagates NotFoundException when the ticker does not exist', async () => {
      stocksService.findByTicker.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(watchlistService.add(42, 'NOPE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(watchlistRepository.create.mock.calls).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('removes a stock from the authenticated user watchlist', async () => {
      const item = makeWatchlistItem({ id: 99 });
      stocksService.findByTicker.mockResolvedValue(makeStock());
      watchlistRepository.findByUserIdAndStockId.mockResolvedValue(item);
      watchlistRepository.deleteById.mockResolvedValue(item);

      const result = await watchlistService.remove(42, 'AAPL');

      expect(watchlistRepository.findByUserIdAndStockId.mock.calls).toEqual([
        [42, 10],
      ]);
      expect(watchlistRepository.deleteById.mock.calls).toEqual([[99]]);
      expect(result).toEqual(item);
    });

    it('throws NotFoundException when the stock is not in the user watchlist', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      watchlistRepository.findByUserIdAndStockId.mockResolvedValue(null);

      await expect(watchlistService.remove(42, 'AAPL')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(watchlistRepository.deleteById.mock.calls).toHaveLength(0);
    });

    it('does not remove a watchlist item that belongs to another user', async () => {
      stocksService.findByTicker.mockResolvedValue(makeStock());
      watchlistRepository.findByUserIdAndStockId.mockResolvedValue(null);

      await expect(watchlistService.remove(42, 'AAPL')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(watchlistRepository.findByUserIdAndStockId.mock.calls).toEqual([
        [42, 10],
      ]);
      expect(watchlistRepository.deleteById.mock.calls).toHaveLength(0);
    });

    it('propagates NotFoundException when the ticker does not exist', async () => {
      stocksService.findByTicker.mockRejectedValue(
        new NotFoundException('Stock not found'),
      );

      await expect(watchlistService.remove(42, 'NOPE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(watchlistRepository.deleteById.mock.calls).toHaveLength(0);
    });
  });
});
