import { Module } from '@nestjs/common';
import { SubmittedReportsController } from './submitted-reports.controller';
import { SubmittedReportsService } from './submitted-reports.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SubmittedReportsController],
  providers: [SubmittedReportsService],
  exports: [SubmittedReportsService],
})
export class SubmittedReportsModule {}
