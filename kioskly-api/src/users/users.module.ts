import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
import { PrivilegeGuard } from '../common/guards/privilege.guard';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, PrivilegeGuard],
})
export class UsersModule {}
