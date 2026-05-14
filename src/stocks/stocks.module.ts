import { Module } from '@nestjs/common';
import { StocksController } from './stocks.controller';
import { StocksRepository } from './repository/stocks.repository';
import { StocksService } from './service/stocks.service';

@Module({
  controllers: [StocksController],
  providers: [StocksService, StocksRepository],
  exports: [StocksService, StocksRepository],
})
export class StocksModule {}
