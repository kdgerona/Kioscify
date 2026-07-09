import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InventorySetupsModule } from '../inventory-setups/inventory-setups.module';

@Module({
  imports: [PrismaModule, InventorySetupsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
