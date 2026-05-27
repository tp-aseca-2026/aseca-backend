import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { WatchlistRepository } from './repository/watchlist.repository';
import { WatchlistService } from './service/watchlist.service';
import { WatchlistController } from './watchlist.controller';
import { EdgarModule } from '../edgar/edgar.module';

@Module({
  imports: [StocksModule, EdgarModule],
  controllers: [WatchlistController],
  providers: [WatchlistService, WatchlistRepository],
})
export class WatchlistModule {}
