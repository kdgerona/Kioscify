import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';
import { CreatePlatformAdminDto } from './dto/create-platform-admin.dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  constructor(private platformService: PlatformService) {}

  @Get('maintenance-status')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Get maintenance status for all portals (public)' })
  getMaintenanceStatus() {
    return this.platformService.getMaintenanceStatus();
  }

  @Patch('maintenance-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update maintenance status for portals (PLATFORM_ADMIN)' })
  updateMaintenanceStatus(@Body() dto: UpdateMaintenanceStatusDto) {
    return this.platformService.updateMaintenanceStatus(dto);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Platform-wide statistics' })
  getStats() {
    return this.platformService.getStats();
  }

  @Get('companies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Paginated list of all companies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getCompanies(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.platformService.getCompanies(page ?? 1, limit ?? 20);
  }

  @Get('activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recent platform activity (last 30 days)' })
  getActivity() {
    return this.platformService.getActivity();
  }

  // ─── Platform admin management ────────────────────────────────────────────

  @Get('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all platform admins' })
  getPlatformAdmins() {
    return this.platformService.getPlatformAdmins();
  }

  @Post('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new platform admin (returns temporary password)' })
  createPlatformAdmin(@Body() dto: CreatePlatformAdminDto) {
    return this.platformService.createPlatformAdmin(dto);
  }

  @Patch('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable or disable a platform admin' })
  updatePlatformAdmin(
    @Param('id') id: string,
    @Body() dto: { isActive: boolean },
    @Request() req,
  ) {
    return this.platformService.updatePlatformAdmin(req.user.id, id, dto);
  }

  @Post('admins/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reset a platform admin's password" })
  resetPlatformAdminPassword(@Param('id') id: string) {
    return this.platformService.resetPlatformAdminPassword(id);
  }

  @Delete('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a platform admin' })
  deletePlatformAdmin(@Param('id') id: string, @Request() req) {
    return this.platformService.deletePlatformAdmin(req.user.id, id);
  }
}
