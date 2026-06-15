import { Module } from '@nestjs/common';
import { UserShiftInventoryReportsController } from './user-shift-inventory-reports.controller';
import { UserShiftInventoryReportsService } from './user-shift-inventory-reports.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UserShiftInventoryReportsController],
  providers: [UserShiftInventoryReportsService],
  exports: [UserShiftInventoryReportsService],
})
export class UserShiftInventoryReportsModule {}
