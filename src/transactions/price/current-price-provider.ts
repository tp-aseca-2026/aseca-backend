export abstract class CurrentPriceProvider {
  abstract getCurrentPrice(ticker: string): Promise<number>;
}
