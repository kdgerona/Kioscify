import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { AuthModule } from '../auth/auth.module';
import { BrandsModule } from '../brands/brands.module';

@Module({
  imports: [MulterModule.register(), AuthModule, BrandsModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
