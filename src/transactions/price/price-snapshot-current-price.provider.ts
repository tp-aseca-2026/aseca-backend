import { Injectable } from '@nestjs/common';
import { PriceSnapshotsService } from '../../price-snapshots/service/price-snapshots.service';
import { CurrentPriceProvider } from './current-price-provider';

@Injectable()
export class PriceSnapshotCurrentPriceProvider extends CurrentPriceProvider {
  constructor(private readonly priceSnapshotsService: PriceSnapshotsService) {
    super();
  }

  async getCurrentPrice(ticker: string): Promise<number> {
    const snapshot =
      await this.priceSnapshotsService.getLatestSnapshotByTicker(ticker);
    return snapshot.price.toNumber();
  }
}
