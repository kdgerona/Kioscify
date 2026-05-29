import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BrandsService } from './brands.service';
import { BrandsController } from './brands.controller';

@Module({
  imports: [MulterModule.register()],
  controllers: [BrandsController],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
