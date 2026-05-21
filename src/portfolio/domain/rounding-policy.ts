export interface RoundingPolicy {
  roundMoney(value: number): number;
  roundPercentage(value: number): number;
}
