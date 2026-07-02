import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
import { SessionsModule } from '../sessions/sessions.module';
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { StorePrivilegeGuard } from '../common/guards/store-privilege.guard';

@Module({
  imports: [AuthModule, SessionsModule],
  controllers: [UsersController],
  providers: [UsersService, PrivilegeGuard, StorePrivilegeGuard],
})
export class UsersModule {}
