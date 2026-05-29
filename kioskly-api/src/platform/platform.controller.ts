import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('platform')
@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PLATFORM_ADMIN')
@ApiBearerAuth()
export class PlatformController {
  constructor(private platformService: PlatformService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide statistics' })
  getStats() {
    return this.platformService.getStats();
  }

  @Get('companies')
  @ApiOperation({ summary: 'Paginated list of all companies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getCompanies(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.platformService.getCompanies(page ?? 1, limit ?? 20);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Recent platform activity (last 30 days)' })
  getActivity() {
    return this.platformService.getActivity();
  }
}
