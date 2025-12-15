import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubmittedInventoryReportsService } from './submitted-inventory-reports.service';
import { CreateSubmittedInventoryReportDto } from './dto/create-submitted-inventory-report.dto';
import { SubmittedInventoryReportFiltersDto } from './dto/submitted-inventory-report-filters.dto';
import { InventoryProgressionQueryDto } from './dto/inventory-progression-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('submitted-inventory-reports')
@Controller('submitted-inventory-reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubmittedInventoryReportsController {
  constructor(
    private readonly submittedInventoryReportsService: SubmittedInventoryReportsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit inventory report' })
  create(
    @Body() createDto: CreateSubmittedInventoryReportDto,
    @Request() req,
  ) {
    return this.submittedInventoryReportsService.create(
      createDto,
      req.user.id,
      req.user.tenantId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all submitted inventory reports' })
  findAll(
    @Query() filters: SubmittedInventoryReportFiltersDto,
    @Request() req,
  ) {
    return this.submittedInventoryReportsService.findAll(
      req.user.tenantId,
      filters,
    );
  }

  @Get('progression')
  @ApiOperation({
    summary: 'Get inventory progression with day-over-day or weekly trends',
  })
  getProgression(@Query() query: InventoryProgressionQueryDto, @Request() req) {
    return this.submittedInventoryReportsService.getProgression(
      req.user.tenantId,
      query,
    );
  }

  @Get('alerts')
  @ApiOperation({
    summary: 'Get inventory alerts (low stock, spikes, stockouts)',
  })
  getAlerts(@Request() req) {
    return this.submittedInventoryReportsService.getAlerts(req.user.tenantId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get submitted inventory reports statistics' })
  getStats(@Request() req) {
    return this.submittedInventoryReportsService.getStats(req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single inventory report by ID' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.submittedInventoryReportsService.findOne(
      id,
      req.user.tenantId,
    );
  }
}
