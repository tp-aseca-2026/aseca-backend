import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/infrastructure/jwt-auth.guard';
import { CreateStockDto } from './dto/create-stock.dto';
import { StocksService } from './service/stocks.service';

@Controller('stocks')
@UseGuards(JwtAuthGuard)
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Post()
  async create(@Body() dto: CreateStockDto) {
    return this.stocksService.create(dto);
  }

  @Get(':ticker')
  async findByTicker(@Param('ticker') ticker: string) {
    return this.stocksService.findByTicker(ticker);
  }
}
