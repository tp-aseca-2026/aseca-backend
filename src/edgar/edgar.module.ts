import { Module } from '@nestjs/common';
import { EdgarController } from './edgar.controller';
import { EdgarClient } from './infrastructure/edgar.client';
import { EdgarService } from './service/edgar.service';

@Module({
  controllers: [EdgarController],
  providers: [EdgarService, EdgarClient],
})
export class EdgarModule {}
