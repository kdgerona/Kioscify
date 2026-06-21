import { Module } from '@nestjs/common';
import { PriceTiersService } from './price-tiers.service';
import { PriceTiersController } from './price-tiers.controller';

@Module({
  controllers: [PriceTiersController],
  providers: [PriceTiersService],
  exports: [PriceTiersService],
})
export class PriceTiersModule {}
