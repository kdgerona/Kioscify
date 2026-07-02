import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffTimeLogsService } from './staff-time-logs.service';
import { StaffTimeLogsController } from './staff-time-logs.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StaffTimeLogsController],
  providers: [StaffTimeLogsService],
  exports: [StaffTimeLogsService],
})
export class StaffTimeLogsModule {}
