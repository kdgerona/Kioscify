import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { MenusModule } from '../menus/menus.module';
import { InventorySetupsModule } from '../inventory-setups/inventory-setups.module';

@Module({
  imports: [MenusModule, InventorySetupsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
