import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, ExpenseCategory } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { RequestExpenseVoidDto } from './dto/request-expense-void.dto';
import { ReviewExpenseVoidDto } from './dto/review-expense-void.dto';
import { ExpenseVoidStatusFilter } from './dto/expense-void-filters.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('expenses')
@Controller('expenses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new expense' })
  @ApiResponse({ status: 201, description: 'Expense created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() createExpenseDto: CreateExpenseDto, @Request() req) {
    return this.expensesService.create(
      createExpenseDto,
      req.user.id,
      req.user.tenantId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all expenses with optional filters' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date filter (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date filter (ISO 8601)',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ExpenseCategory,
    description: 'Filter by expense category',
  })
  @ApiQuery({
    name: 'minAmount',
    required: false,
    description: 'Minimum expense amount',
  })
  @ApiQuery({
    name: 'maxAmount',
    required: false,
    description: 'Maximum expense amount',
  })
  @ApiResponse({
    status: 200,
    description: 'Expenses retrieved successfully',
  })
  findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: ExpenseCategory,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
    @Request() req?,
  ) {
    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (category) filters.category = category;
    if (minAmount) filters.minAmount = parseFloat(minAmount);
    if (maxAmount) filters.maxAmount = parseFloat(maxAmount);

    return this.expensesService.findAll(req.user.tenantId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get expense statistics' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'monthly'],
    description: 'Statistics period (default: daily)',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  getStats(
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'daily',
    @TenantId() tenantId: string,
  ) {
    return this.expensesService.getStats(tenantId, period);
  }

  @Get('void-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get all void requests for expenses' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ExpenseVoidStatusFilter,
    description: 'Filter by void status',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter from date (ISO 8601)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter to date (ISO 8601)',
  })
  @ApiResponse({
    status: 200,
    description: 'Void requests retrieved successfully',
  })
  getVoidRequests(
    @TenantId() tenantId: string,
    @Query('status') status?: ExpenseVoidStatusFilter,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expensesService.getVoidRequests(tenantId, {
      status,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single expense by ID' })
  @ApiResponse({
    status: 200,
    description: 'Expense retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.expensesService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an expense' })
  @ApiResponse({
    status: 200,
    description: 'Expense updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  update(
    @Param('id') id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @TenantId() tenantId: string,
  ) {
    return this.expensesService.update(id, tenantId, updateExpenseDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an expense' })
  @ApiResponse({
    status: 200,
    description: 'Expense deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.expensesService.remove(id, tenantId);
  }

  // Void Request Endpoints

  @Post(':id/void-request')
  @ApiOperation({ summary: 'Request void for an expense' })
  @ApiResponse({
    status: 201,
    description: 'Void request submitted successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  requestVoid(
    @Param('id') id: string,
    @Body() requestVoidDto: RequestExpenseVoidDto,
    @Request() req,
  ) {
    return this.expensesService.requestVoid(
      id,
      req.user.tenantId,
      req.user.id,
      requestVoidDto.reason,
    );
  }

  @Patch('void-requests/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Approve a void request' })
  @ApiResponse({
    status: 200,
    description: 'Void request approved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  approveVoid(@Param('id') id: string, @Request() req) {
    return this.expensesService.approveVoid(id, req.user.tenantId, req.user.id);
  }

  @Patch('void-requests/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reject a void request' })
  @ApiResponse({
    status: 200,
    description: 'Void request rejected successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 404, description: 'Expense not found' })
  rejectVoid(
    @Param('id') id: string,
    @Body() reviewVoidDto: ReviewExpenseVoidDto,
    @Request() req,
  ) {
    return this.expensesService.rejectVoid(
      id,
      req.user.tenantId,
      req.user.id,
      reviewVoidDto.rejectionReason,
    );
  }
}
