import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateStockDto } from '../dto/create-stock.dto';
import type { Stock } from '../domain/stock.entity';
import { StocksRepository } from '../repository/stocks.repository';

@Injectable()
export class StocksService {
  constructor(private readonly stocksRepository: StocksRepository) {}

  async create(dto: CreateStockDto): Promise<Stock> {
    const ticker = this.normalizeTicker(dto.ticker);

    if (!ticker) {
      throw new BadRequestException('Ticker must not be empty');
    }

    const existing = await this.stocksRepository.findByTicker(ticker);
    if (existing) {
      throw new ConflictException(`Stock with ticker ${ticker} already exists`);
    }

    return this.stocksRepository.create({
      ticker,
      companyName: dto.companyName,
      cik: dto.cik,
    });
  }

  async findByTicker(ticker: string): Promise<Stock> {
    const normalized = this.normalizeTicker(ticker);
    const stock = await this.stocksRepository.findByTicker(normalized);

    if (!stock) {
      throw new NotFoundException(`Stock with ticker ${normalized} not found`);
    }

    return stock;
  }

  private normalizeTicker(ticker: string): string {
    return ticker.trim().toUpperCase();
  }

  async findAll(): Promise<Stock[]> {
    return this.stocksRepository.findAll();
  }
}
