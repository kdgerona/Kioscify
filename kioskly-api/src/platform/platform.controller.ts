import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';

@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  constructor(private platformService: PlatformService) {}

  @Get('maintenance-status')
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
}
