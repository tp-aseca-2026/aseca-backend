import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdatePriceSnapshotsDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tickers?: string[];
}
