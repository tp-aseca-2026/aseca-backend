import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { JwtAuthGuard } from '../auth/infrastructure/jwt-auth.guard';
import { BuyTransactionDto } from './dto/buy-transaction.dto';
import { SellTransactionDto } from './dto/sell-transaction.dto';
import { TransactionsService } from './service/transactions.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('buy')
  async buy(@Req() req: AuthenticatedRequest, @Body() dto: BuyTransactionDto) {
    return this.transactionsService.buy(req.user.id, dto.ticker, dto.quantity);
  }

  @Post('sell')
  async sell(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SellTransactionDto,
  ) {
    return this.transactionsService.sell(req.user.id, dto.ticker, dto.quantity);
  }

  @Get()
  async getHistory(@Req() req: AuthenticatedRequest) {
    return this.transactionsService.getHistory(req.user.id);
  }
}
