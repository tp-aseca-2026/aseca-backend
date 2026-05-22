import { Injectable } from '@nestjs/common';

@Injectable()
export abstract class CurrentPriceProvider {
  abstract getCurrentPrice(ticker: string): Promise<number>;
}
