import { Controller, Get, Post, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserShiftReportsService } from './user-shift-reports.service';
import { CreateSubmittedReportDto } from '../submitted-reports/dto/create-submitted-report.dto';
import { UserShiftReportFiltersDto } from './dto/user-shift-report-filters.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('user-shift-reports')
@Controller('user-shift-reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserShiftReportsController {
  constructor(private readonly userShiftReportsService: UserShiftReportsService) {}

  @SkipThrottle()
  @Post()
  @ApiOperation({ summary: 'Submit a user shift report' })
  @ApiResponse({ status: 201, description: 'Shift report submitted successfully' })
  create(@Body() dto: CreateSubmittedReportDto, @Request() req) {
    return this.userShiftReportsService.create(dto, req.user.id, req.user.tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Get shift reports (STORE_ADMIN sees all; CASHIER sees own)' })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  findAll(@Query() filters: UserShiftReportFiltersDto, @Request() req) {
    return this.userShiftReportsService.findAll(
      req.user.tenantId,
      req.user.id,
      req.user.role,
      filters,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get shift report stats for the current user' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats(@Request() req) {
    return this.userShiftReportsService.getStats(req.user.id, req.user.tenantId);
  }

  @Get('today-count')
  @ApiOperation({ summary: 'Get number of shift reports submitted today by the current user' })
  getTodayCount(@Request() req) {
    return this.userShiftReportsService.getTodayCount(req.user.id, req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single shift report by ID' })
  @ApiResponse({ status: 200, description: 'Report retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.userShiftReportsService.findOne(id, req.user.tenantId, req.user.id, req.user.role);
  }
}
