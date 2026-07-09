import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PriceTiersModule } from '../price-tiers/price-tiers.module';
import { MenusModule } from '../menus/menus.module';

@Module({
  imports: [PriceTiersModule, MenusModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
