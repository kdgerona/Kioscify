import {
  Controller,
  Get,
  Post,
  Patch,
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
  ApiQuery,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('transactions')
@Controller('transactions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  @ApiResponse({ status: 201, description: 'Transaction created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() createTransactionDto: CreateTransactionDto, @Request() req) {
    return this.transactionsService.create(
      createTransactionDto,
      req.user.id,
      req.user.tenantId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all transactions with optional filters' })
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
    name: 'paymentMethod',
    required: false,
    enum: ['CASH', 'CARD', 'GCASH', 'PAYMAYA', 'ONLINE'],
    description: 'Filter by payment method',
  })
  @ApiQuery({
    name: 'paymentStatus',
    required: false,
    enum: ['COMPLETED', 'PENDING', 'FAILED'],
    description: 'Filter by payment status',
  })
  @ApiQuery({
    name: 'transactionId',
    required: false,
    description: 'Search by transaction ID (partial match)',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
  })
  findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('paymentMethod')
    paymentMethod?: 'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA' | 'ONLINE',
    @Query('paymentStatus') paymentStatus?: 'COMPLETED' | 'PENDING' | 'FAILED',
    @Query('transactionId') transactionId?: string,
    @Request() req?,
  ) {
    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (paymentMethod) filters.paymentMethod = paymentMethod;
    if (paymentStatus) filters.paymentStatus = paymentStatus;
    if (transactionId) filters.transactionId = transactionId;

    return this.transactionsService.findAll(req.user.tenantId, filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get sales statistics' })
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
    return this.transactionsService.getStats(tenantId, period);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single transaction by ID with all details' })
  @ApiResponse({
    status: 200,
    description: 'Transaction retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.transactionsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update transaction remarks' })
  @ApiResponse({
    status: 200,
    description: 'Transaction updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  update(
    @Param('id') id: string,
    @Body() updateTransactionDto: UpdateTransactionDto,
    @TenantId() tenantId: string,
  ) {
    return this.transactionsService.updateRemarks(
      id,
      tenantId,
      updateTransactionDto.remarks,
    );
  }
}
