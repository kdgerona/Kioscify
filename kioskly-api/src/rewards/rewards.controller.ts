import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RewardsService, RewardsCaller } from './rewards.service';
import {
  CompanyScopeQueryDto,
  CreateRewardProgramDto,
  ListRewardProgramsQueryDto,
  SetRewardProgramStoresDto,
  UpdateRewardProgramDto,
} from './dto/reward-program.dto';
import { RewardEventsQueryDto } from './dto/reward-events-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { StorePrivilegeGuard } from '../common/guards/store-privilege.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
import { RequireStorePrivilege } from '../common/decorators/require-store-privilege.decorator';

const caller = (req: any): RewardsCaller => ({
  id: req.user.id,
  role: req.user.role,
  tenantId: req.user.tenantId,
  companyId: req.user.companyId,
});

// PrivilegeGuard only acts on COMPANY_ADMIN and StorePrivilegeGuard only on
// STORE_ADMIN/ADMIN, so both decorators can sit on the same handler.
@ApiTags('rewards')
@ApiBearerAuth()
@Controller('rewards')
@UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard, StorePrivilegeGuard)
export class RewardsController {
  constructor(private rewards: RewardsService) {}

  @Get('active')
  @Roles('CASHIER', 'STORE_ADMIN')
  @ApiOperation({
    summary: "Programs active now for the caller's store (kiosk)",
  })
  active(@Request() req) {
    return this.rewards.getActiveForTenant(req.user.tenantId);
  }

  @Get('programs')
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'STORE_ADMIN')
  @RequirePrivilege('rewards', 'read')
  @RequireStorePrivilege('rewards', 'read')
  @ApiOperation({
    summary:
      'List programs. Company: its COMPANY programs (or ?scope=STORE). Store: own programs + enrolled company programs (read-only).',
  })
  listPrograms(@Query() query: ListRewardProgramsQueryDto, @Request() req) {
    return this.rewards.listPrograms(caller(req), query);
  }

  @Get('programs/:id')
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'STORE_ADMIN')
  @RequirePrivilege('rewards', 'read')
  @RequireStorePrivilege('rewards', 'read')
  @ApiOperation({ summary: 'Get one program' })
  @ApiResponse({
    status: 404,
    description: 'Not found or not visible to the caller',
  })
  getProgram(
    @Param('id') id: string,
    @Query() query: CompanyScopeQueryDto,
    @Request() req,
  ) {
    return this.rewards.getProgram(id, caller(req), query.companyId);
  }

  @Post('programs')
  @Roles('COMPANY_ADMIN', 'STORE_ADMIN')
  @RequirePrivilege('rewards', 'write')
  @RequireStorePrivilege('rewards', 'write')
  @ApiOperation({
    summary:
      'Create a program (COMPANY scope for company admins, STORE scope for store admins)',
  })
  createProgram(@Body() dto: CreateRewardProgramDto, @Request() req) {
    return this.rewards.createProgram(dto, caller(req));
  }

  @Patch('programs/:id')
  @Roles('COMPANY_ADMIN', 'STORE_ADMIN')
  @RequirePrivilege('rewards', 'write')
  @RequireStorePrivilege('rewards', 'write')
  @ApiOperation({ summary: 'Update a program the caller owns' })
  @ApiResponse({
    status: 403,
    description: 'Program is visible but read-only for the caller',
  })
  updateProgram(
    @Param('id') id: string,
    @Body() dto: UpdateRewardProgramDto,
    @Request() req,
  ) {
    return this.rewards.updateProgram(id, dto, caller(req));
  }

  @Delete('programs/:id')
  @Roles('COMPANY_ADMIN', 'STORE_ADMIN')
  @RequirePrivilege('rewards', 'all')
  @RequireStorePrivilege('rewards', 'all')
  @ApiOperation({
    summary: 'Soft-delete a program the caller owns (events are kept)',
  })
  deleteProgram(@Param('id') id: string, @Request() req) {
    return this.rewards.deleteProgram(id, caller(req));
  }

  @Put('programs/:id/stores')
  @Roles('COMPANY_ADMIN')
  @RequirePrivilege('rewards', 'write')
  @ApiOperation({
    summary: 'Replace the set of stores enrolled in a company program',
  })
  setStores(
    @Param('id') id: string,
    @Body() dto: SetRewardProgramStoresDto,
    @Request() req,
  ) {
    return this.rewards.setStores(id, dto.tenantIds, caller(req));
  }

  @Get('events')
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'STORE_ADMIN')
  @RequirePrivilege('rewards', 'read')
  @RequireStorePrivilege('rewards', 'read')
  @ApiOperation({ summary: 'Paginated reward events ({ data, pagination })' })
  listEvents(@Query() query: RewardEventsQueryDto, @Request() req) {
    return this.rewards.listEvents(caller(req), query);
  }

  @Get('summary')
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'STORE_ADMIN')
  @RequirePrivilege('rewards', 'read')
  @RequireStorePrivilege('rewards', 'read')
  @ApiOperation({
    summary:
      'Totals per event type, reward discount, per-slot and per-store breakdowns',
  })
  summary(@Query() query: RewardEventsQueryDto, @Request() req) {
    return this.rewards.summary(caller(req), query);
  }
}
