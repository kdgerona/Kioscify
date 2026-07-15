import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HeldOrdersService } from './held-orders.service';
import { HeldOrdersController } from './held-orders.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HeldOrdersController],
  providers: [HeldOrdersService],
  exports: [HeldOrdersService],
})
export class HeldOrdersModule {}
