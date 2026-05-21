import { IsNotEmpty, IsString } from 'class-validator';

export class AddWatchlistItemDto {
  @IsString()
  @IsNotEmpty()
  ticker: string;
}
