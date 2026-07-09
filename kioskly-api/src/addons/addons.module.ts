import { Module } from '@nestjs/common';
import { AddonsService } from './addons.service';
import { AddonsController } from './addons.controller';
import { PriceTiersModule } from '../price-tiers/price-tiers.module';
import { MenusModule } from '../menus/menus.module';

@Module({
  imports: [PriceTiersModule, MenusModule],
  controllers: [AddonsController],
  providers: [AddonsService],
  exports: [AddonsService],
})
export class AddonsModule {}
