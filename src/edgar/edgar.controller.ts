import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { EdgarService } from './service/edgar.service';

@Controller('edgar')
export class EdgarController {
  constructor(private readonly edgarService: EdgarService) {}

  @Get('companies/search')
  async searchCompanies(@Query('q') q: string) {
    if (!q?.trim()) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return this.edgarService.searchCompanies(q);
  }

  @Get('companies/:ticker/metrics')
  async getMetrics(@Param('ticker') ticker: string) {
    return this.edgarService.getMetrics(ticker);
  }

  @Get('companies/:ticker/filings')
  async getFilings(@Param('ticker') ticker: string) {
    return this.edgarService.getFilings(ticker);
  }

  @Get('companies/:ticker/historical-metrics')
  async getHistoricalMetrics(@Param('ticker') ticker: string) {
    return this.edgarService.getHistoricalMetrics(ticker);
  }
}
