import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { AuthModule } from '../auth/auth.module';
import { ExportModule } from '../export/export.module';

@Module({
  imports: [MulterModule.register(), AuthModule, ExportModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
