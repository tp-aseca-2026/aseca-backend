import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StocksRepository } from '../../../src/stocks/repository/stocks.repository';
import { StocksService } from '../../../src/stocks/service/stocks.service';

const makeStock = (overrides = {}) => ({
  id: 1,
  ticker: 'AAPL',
  companyName: null,
  cik: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('StocksService', () => {
  let stocksService: StocksService;
  let stocksRepository: jest.Mocked<StocksRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        StocksService,
        {
          provide: StocksRepository,
          useValue: {
            create: jest.fn(),
            findByTicker: jest.fn(),
          },
        },
      ],
    }).compile();

    stocksService = moduleRef.get(StocksService);
    stocksRepository = moduleRef.get(StocksRepository);
  });

  describe('create', () => {
    it('normalizes ticker to uppercase before saving', async () => {
      stocksRepository.findByTicker.mockResolvedValue(null);
      stocksRepository.create.mockResolvedValue(makeStock({ ticker: 'AAPL' }));

      await stocksService.create({ ticker: 'aapl' });

      expect(stocksRepository.findByTicker).toHaveBeenCalledWith('AAPL');
      expect(stocksRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'AAPL' }),
      );
    });

    it('trims whitespace from ticker before saving', async () => {
      stocksRepository.findByTicker.mockResolvedValue(null);
      stocksRepository.create.mockResolvedValue(makeStock({ ticker: 'MSFT' }));

      await stocksService.create({ ticker: '  msft  ' });

      expect(stocksRepository.findByTicker).toHaveBeenCalledWith('MSFT');
      expect(stocksRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'MSFT' }),
      );
    });

    it('returns the created stock', async () => {
      const stock = makeStock({ ticker: 'TSLA', companyName: 'Tesla Inc.' });
      stocksRepository.findByTicker.mockResolvedValue(null);
      stocksRepository.create.mockResolvedValue(stock);

      const result = await stocksService.create({
        ticker: 'tsla',
        companyName: 'Tesla Inc.',
      });

      expect(result).toEqual(stock);
    });

    it('throws ConflictException when ticker already exists', async () => {
      stocksRepository.findByTicker.mockResolvedValue(makeStock());

      await expect(
        stocksService.create({ ticker: 'AAPL' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(stocksRepository.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for blank ticker', async () => {
      await expect(
        stocksService.create({ ticker: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stocksRepository.findByTicker).not.toHaveBeenCalled();
      expect(stocksRepository.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for empty ticker', async () => {
      await expect(stocksService.create({ ticker: '' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stocksRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findByTicker', () => {
    it('normalizes ticker to uppercase when searching', async () => {
      const stock = makeStock({ ticker: 'AAPL', companyName: 'Apple Inc.' });
      stocksRepository.findByTicker.mockResolvedValue(stock);

      const result = await stocksService.findByTicker('aapl');

      expect(stocksRepository.findByTicker).toHaveBeenCalledWith('AAPL');
      expect(result).toEqual(stock);
    });

    it('trims whitespace from ticker when searching', async () => {
      const stock = makeStock({ ticker: 'GOOG' });
      stocksRepository.findByTicker.mockResolvedValue(stock);

      await stocksService.findByTicker('  goog  ');

      expect(stocksRepository.findByTicker).toHaveBeenCalledWith('GOOG');
    });

    it('throws NotFoundException when stock does not exist', async () => {
      stocksRepository.findByTicker.mockResolvedValue(null);

      await expect(
        stocksService.findByTicker('UNKNOWN'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
