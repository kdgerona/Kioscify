import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PrivilegeGuard } from '../common/guards/privilege.guard';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PrivilegeGuard],
})
export class AnalyticsModule {}
