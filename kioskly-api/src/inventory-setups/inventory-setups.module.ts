import { Module } from '@nestjs/common';
import { InventorySetupsService } from './inventory-setups.service';
import { InventorySetupsController, TenantInventoryOverrideController } from './inventory-setups.controller';

@Module({
  controllers: [InventorySetupsController, TenantInventoryOverrideController],
  providers: [InventorySetupsService],
  exports: [InventorySetupsService],
})
export class InventorySetupsModule {}
