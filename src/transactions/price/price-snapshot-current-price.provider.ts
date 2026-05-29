import { Injectable, NotFoundException } from '@nestjs/common';
import { PriceSnapshotsService } from '../../price-snapshots/service/price-snapshots.service';
import { CurrentPriceProvider } from './current-price-provider';

@Injectable()
export class PriceSnapshotCurrentPriceProvider extends CurrentPriceProvider {
  constructor(private readonly priceSnapshotsService: PriceSnapshotsService) {
    super();
  }

  async getCurrentPrice(ticker: string): Promise<number> {
    try {
      return await this.getPersistedCurrentPrice(ticker);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
    }

    await this.priceSnapshotsService.runUpdate([ticker]);

    return this.getPersistedCurrentPrice(ticker);
  }

  private async getPersistedCurrentPrice(ticker: string): Promise<number> {
    const snapshot =
      await this.priceSnapshotsService.getLatestSnapshotByTicker(ticker);
    return snapshot.price.toNumber();
  }
}
