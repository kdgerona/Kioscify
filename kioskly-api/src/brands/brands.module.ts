import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BrandsService } from './brands.service';
import { BrandsController } from './brands.controller';
import { PrivilegeGuard } from '../common/guards/privilege.guard';

@Module({
  imports: [MulterModule.register()],
  controllers: [BrandsController],
  providers: [BrandsService, PrivilegeGuard],
  exports: [BrandsService],
})
export class BrandsModule {}
