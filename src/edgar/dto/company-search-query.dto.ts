import { IsNotEmpty, IsString } from 'class-validator';

export class CompanySearchQueryDto {
  @IsString()
  @IsNotEmpty()
  q: string;
}
