import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/infrastructure/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/domain/authenticated-user';
import { PortfolioService } from './service/portfolio.service';

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  getPortfolio(@Req() req: AuthenticatedRequest) {
    return this.portfolioService.getPortfolio(req.user.id);
  }
}
