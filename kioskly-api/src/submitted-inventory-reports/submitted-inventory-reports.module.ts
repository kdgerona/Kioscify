import { Module } from '@nestjs/common';
import { SubmittedInventoryReportsService } from './submitted-inventory-reports.service';
import { SubmittedInventoryReportsController } from './submitted-inventory-reports.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SubmittedInventoryReportsController],
  providers: [SubmittedInventoryReportsService],
  exports: [SubmittedInventoryReportsService],
})
export class SubmittedInventoryReportsModule {}
