import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PriceSnapshotsService } from '../../../src/price-snapshots/service/price-snapshots.service';
import { PriceSnapshotCurrentPriceProvider } from '../../../src/transactions/price/price-snapshot-current-price.provider';

const makeSnapshot = (price: number) =>
  ({
    ticker: 'AAPL',
    stockId: 10,
    price: { toNumber: () => price },
    source: 'YAHOO_FINANCE',
    fetchedAt: new Date('2026-05-28T12:00:00.000Z'),
  }) as Awaited<ReturnType<PriceSnapshotsService['getLatestSnapshotByTicker']>>;

describe('PriceSnapshotCurrentPriceProvider', () => {
  let provider: PriceSnapshotCurrentPriceProvider;
  let priceSnapshotsService: jest.Mocked<PriceSnapshotsService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PriceSnapshotCurrentPriceProvider,
        {
          provide: PriceSnapshotsService,
          useValue: {
            getLatestSnapshotByTicker: jest.fn(),
            runUpdate: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = moduleRef.get(PriceSnapshotCurrentPriceProvider);
    priceSnapshotsService = moduleRef.get(PriceSnapshotsService);
  });

  it('returns the latest persisted price when a snapshot exists', async () => {
    priceSnapshotsService.getLatestSnapshotByTicker.mockResolvedValue(
      makeSnapshot(180.25),
    );

    const price = await provider.getCurrentPrice('AAPL');

    expect(price).toBe(180.25);
    expect(priceSnapshotsService.runUpdate.mock.calls).toHaveLength(0);
  });

  it('updates the ticker and retries when the snapshot is missing', async () => {
    priceSnapshotsService.getLatestSnapshotByTicker
      .mockRejectedValueOnce(new NotFoundException('No snapshot'))
      .mockResolvedValueOnce(makeSnapshot(181.5));
    priceSnapshotsService.runUpdate.mockResolvedValue({
      processed: 1,
      saved: 1,
      failed: [],
      updatedAt: '2026-05-28T12:01:00.000Z',
    });

    const price = await provider.getCurrentPrice('aapl');

    expect(price).toBe(181.5);
    expect(priceSnapshotsService.runUpdate.mock.calls).toEqual([[['aapl']]]);
    expect(priceSnapshotsService.getLatestSnapshotByTicker.mock.calls).toEqual([
      ['aapl'],
      ['aapl'],
    ]);
  });

  it('does not update when snapshot lookup fails for a different reason', async () => {
    priceSnapshotsService.getLatestSnapshotByTicker.mockRejectedValue(
      new InternalServerErrorException('Database error'),
    );

    await expect(provider.getCurrentPrice('AAPL')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(priceSnapshotsService.runUpdate.mock.calls).toHaveLength(0);
  });
});
