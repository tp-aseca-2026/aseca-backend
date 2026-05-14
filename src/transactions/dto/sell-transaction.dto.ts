import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class SellTransactionDto {
  @IsString()
  @IsNotEmpty()
  ticker: string;

  @IsInt()
  @IsPositive()
  quantity: number;
}
