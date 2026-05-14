import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class BuyTransactionDto {
  @IsString()
  @IsNotEmpty()
  ticker: string;

  @IsInt()
  @IsPositive()
  quantity: number;
}
