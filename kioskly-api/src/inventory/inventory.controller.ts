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
import { InventoryService } from './inventory.service';
import {
  CreateInventoryItemDto,
  InventoryCategory,
} from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import {
  CreateInventoryRecordDto,
  BulkCreateInventoryRecordDto,
} from './dto/create-inventory-record.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // Inventory Items Endpoints
  @Post('items')
  @ApiOperation({ summary: 'Create a new inventory item' })
  @ApiResponse({
    status: 201,
    description: 'Inventory item created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createItem(
    @Body() createDto: CreateInventoryItemDto,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.createItem(createDto, tenantId);
  }

  @Get('items')
  @ApiOperation({ summary: 'Get all inventory items' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: InventoryCategory,
    description: 'Filter by inventory category',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventory items retrieved successfully',
  })
  findAllItems(
    @Query('category') category?: InventoryCategory,
    @TenantId() tenantId?: string,
  ) {
    return this.inventoryService.findAllItems(tenantId!, category);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get a single inventory item by ID' })
  @ApiResponse({
    status: 200,
    description: 'Inventory item retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  findOneItem(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.inventoryService.findOneItem(id, tenantId);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: 'Update an inventory item' })
  @ApiResponse({
    status: 200,
    description: 'Inventory item updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  updateItem(
    @Param('id') id: string,
    @Body() updateDto: UpdateInventoryItemDto,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.updateItem(id, tenantId, updateDto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Delete an inventory item' })
  @ApiResponse({
    status: 200,
    description: 'Inventory item deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  removeItem(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.inventoryService.removeItem(id, tenantId);
  }

  // Inventory Records Endpoints
  @Post('records')
  @ApiOperation({ summary: 'Record a single inventory count' })
  @ApiResponse({
    status: 201,
    description: 'Inventory record created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  createRecord(
    @Body() createDto: CreateInventoryRecordDto,
    @Request() req: Request & { user: { id: string; tenantId: string } },
  ) {
    return this.inventoryService.createRecord(
      createDto,
      req.user.id,
      req.user.tenantId,
    );
  }

  @Post('records/bulk')
  @ApiOperation({ summary: 'Record multiple inventory counts at once' })
  @ApiResponse({
    status: 201,
    description: 'Inventory records created successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 404,
    description: 'One or more inventory items not found',
  })
  bulkCreateRecords(
    @Body() bulkDto: BulkCreateInventoryRecordDto,
    @Request() req: Request & { user: { id: string; tenantId: string } },
  ) {
    return this.inventoryService.bulkCreateRecords(
      bulkDto,
      req.user.id,
      req.user.tenantId,
    );
  }

  @Get('records')
  @ApiOperation({ summary: 'Get all inventory records with optional filters' })
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
    name: 'inventoryItemId',
    required: false,
    description: 'Filter by inventory item ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventory records retrieved successfully',
  })
  findAllRecords(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('inventoryItemId') inventoryItemId?: string,
    @TenantId() tenantId?: string,
  ) {
    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);
    if (inventoryItemId) filters.inventoryItemId = inventoryItemId;

    return this.inventoryService.findAllRecords(tenantId!, filters);
  }

  @Get('latest')
  @ApiOperation({
    summary: 'Get latest inventory counts for all items',
    description:
      'Returns the most recent inventory count for each item, optionally for a specific date',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date to get inventory for (ISO 8601, defaults to today)',
  })
  @ApiResponse({
    status: 200,
    description: 'Latest inventory retrieved successfully',
  })
  getLatestInventory(
    @Query('date') date?: string,
    @TenantId() tenantId?: string,
  ) {
    const targetDate = date ? new Date(date) : undefined;
    return this.inventoryService.getLatestInventory(tenantId!, targetDate);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get inventory statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  getStats(@TenantId() tenantId: string) {
    return this.inventoryService.getInventoryStats(tenantId);
  }
}
