import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubmittedReportsService } from './submitted-reports.service';
import { CreateSubmittedReportDto } from './dto/create-submitted-report.dto';
import { SubmittedReportFiltersDto } from './dto/submitted-report-filters.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('submitted-reports')
@Controller('submitted-reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubmittedReportsController {
  constructor(
    private readonly submittedReportsService: SubmittedReportsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit a daily report' })
  @ApiResponse({ status: 201, description: 'Report submitted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() createDto: CreateSubmittedReportDto, @Request() req) {
    return this.submittedReportsService.create(
      createDto,
      req.user.id,
      req.user.tenantId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all submitted reports with filters' })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  findAll(@Query() filters: SubmittedReportFiltersDto, @Request() req) {
    return this.submittedReportsService.findAll(req.user.tenantId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get submitted reports statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats(@Request() req) {
    return this.submittedReportsService.getStats(req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single submitted report by ID' })
  @ApiResponse({ status: 200, description: 'Report retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.submittedReportsService.findOne(id, req.user.tenantId);
  }
}
