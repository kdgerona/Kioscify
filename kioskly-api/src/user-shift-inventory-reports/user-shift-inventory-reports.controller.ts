import { Controller, Get, Post, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserShiftInventoryReportsService } from './user-shift-inventory-reports.service';
import { CreateSubmittedInventoryReportDto } from '../submitted-inventory-reports/dto/create-submitted-inventory-report.dto';
import { UserShiftInventoryReportFiltersDto } from './dto/user-shift-inventory-report-filters.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('user-shift-inventory-reports')
@Controller('user-shift-inventory-reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserShiftInventoryReportsController {
  constructor(private readonly service: UserShiftInventoryReportsService) {}

  @SkipThrottle()
  @Post()
  @ApiOperation({ summary: 'Submit a user shift inventory report' })
  @ApiResponse({ status: 201, description: 'Shift inventory report submitted successfully' })
  create(@Body() dto: CreateSubmittedInventoryReportDto, @Request() req) {
    return this.service.create(dto, req.user.id, req.user.tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Get shift inventory reports' })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  findAll(@Query() filters: UserShiftInventoryReportFiltersDto, @Request() req) {
    return this.service.findAll(req.user.tenantId, req.user.id, req.user.role, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get shift inventory report stats for the current user' })
  getStats(@Request() req) {
    return this.service.getStats(req.user.id, req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single shift inventory report by ID' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.service.findOne(id, req.user.tenantId, req.user.id, req.user.role);
  }
}
