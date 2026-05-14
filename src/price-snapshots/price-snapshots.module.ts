import { Module } from '@nestjs/common';
import { PriceSnapshotsController } from './price-snapshots.controller';
import { PriceSnapshotsRepository } from './repository/price-snapshots.repository';
import { PriceSnapshotsService } from './service/price-snapshots.service';

@Module({
  controllers: [PriceSnapshotsController],
  providers: [PriceSnapshotsService, PriceSnapshotsRepository],
  exports: [PriceSnapshotsService, PriceSnapshotsRepository],
})
export class PriceSnapshotsModule {}
