import type { RoundingPolicy } from './rounding-policy';

export class TwoDecimalRoundingPolicy implements RoundingPolicy {
  roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  roundPercentage(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
