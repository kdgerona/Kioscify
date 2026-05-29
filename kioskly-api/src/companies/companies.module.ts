import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [MulterModule.register(), AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
