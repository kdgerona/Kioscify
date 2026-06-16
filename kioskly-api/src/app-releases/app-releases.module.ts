import { Module } from '@nestjs/common';
import { AppReleasesService } from './app-releases.service';
import { AppReleasesController, AppVersionController } from './app-releases.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppReleasesController, AppVersionController],
  providers: [AppReleasesService],
})
export class AppReleasesModule {}
