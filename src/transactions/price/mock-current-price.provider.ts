import { Injectable } from '@nestjs/common';
import { CurrentPriceProvider } from './current-price-provider';

@Injectable()
export class MockCurrentPriceProvider extends CurrentPriceProvider {
  private readonly MOCK_PRICE = 100;

  async getCurrentPrice(_ticker: string): Promise<number> {
    return this.MOCK_PRICE;
  }
}