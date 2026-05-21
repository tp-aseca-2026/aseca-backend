import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { JwtAuthGuard } from '../auth/infrastructure/jwt-auth.guard';
import { AddWatchlistItemDto } from './dto/add-watchlist-item.dto';
import { WatchlistService } from './service/watchlist.service';

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Controller('watchlist')
@UseGuards(JwtAuthGuard)
export class WatchlistController {
  constructor(private readonly watchlistService: WatchlistService) {}

  @Get()
  getWatchlist(@Req() req: AuthenticatedRequest) {
    return this.watchlistService.getWatchlist(req.user.id);
  }

  @Post()
  add(@Req() req: AuthenticatedRequest, @Body() dto: AddWatchlistItemDto) {
    return this.watchlistService.add(req.user.id, dto.ticker);
  }

  @Delete(':ticker')
  remove(@Req() req: AuthenticatedRequest, @Param('ticker') ticker: string) {
    return this.watchlistService.remove(req.user.id, ticker);
  }
}
