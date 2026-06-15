import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { AuthModule } from '../auth/auth.module';
import { PrivilegeGuard } from '../common/guards/privilege.guard';

@Module({
  imports: [MulterModule.register(), AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, PrivilegeGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
