import { Module } from '@nestjs/common';
import { UserShiftReportsController } from './user-shift-reports.controller';
import { UserShiftReportsService } from './user-shift-reports.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UserShiftReportsController],
  providers: [UserShiftReportsService],
  exports: [UserShiftReportsService],
})
export class UserShiftReportsModule {}
