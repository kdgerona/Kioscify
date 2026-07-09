import { Module } from '@nestjs/common';
import { SizesService } from './sizes.service';
import { SizesController } from './sizes.controller';
import { PriceTiersModule } from '../price-tiers/price-tiers.module';
import { MenusModule } from '../menus/menus.module';

@Module({
  imports: [PriceTiersModule, MenusModule],
  controllers: [SizesController],
  providers: [SizesService],
  exports: [SizesService],
})
export class SizesModule {}
