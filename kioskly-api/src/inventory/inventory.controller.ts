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
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { CreateStoreInventoryItemDto } from './dto/create-store-inventory-item.dto';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';
import {
  CreateInventoryRecordDto,
  BulkCreateInventoryRecordDto,
} from './dto/create-inventory-record.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ─── Admin/builder CRUD — items directly owned by an InventorySetup ───────

  @Post('setup-items')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Create an inventory item on an inventory setup' })
  @ApiQuery({ name: 'inventorySetupId', required: true })
  createSetupItem(@Body() createDto: CreateInventoryItemDto, @Query('inventorySetupId') inventorySetupId: string) {
    if (!inventorySetupId) throw new BadRequestException('inventorySetupId query param is required');
    return this.inventoryService.createSetupItem(createDto, inventorySetupId);
  }

  @Patch('setup-items/:id')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Update an inventory item on an inventory setup' })
  @ApiQuery({ name: 'inventorySetupId', required: true })
  updateSetupItem(
    @Param('id') id: string,
    @Body() updateDto: UpdateInventoryItemDto,
    @Query('inventorySetupId') inventorySetupId: string,
  ) {
    return this.inventoryService.updateSetupItem(id, updateDto, inventorySetupId);
  }

  @Delete('setup-items/:id')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Delete an inventory item from its setup (preserved for history, not hard-deleted)' })
  @ApiQuery({ name: 'inventorySetupId', required: true })
  removeSetupItem(@Param('id') id: string, @Query('inventorySetupId') inventorySetupId: string) {
    return this.inventoryService.removeSetupItem(id, inventorySetupId);
  }

  @Get('setup-items')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Get all inventory items on an inventory setup' })
  @ApiQuery({ name: 'inventorySetupId', required: true })
  @ApiQuery({ name: 'includeLegacy', required: false, description: 'Include deprecated/tombstoned items preserved for history' })
  findAllForSetup(
    @Query('inventorySetupId') inventorySetupId: string,
    @Query('includeLegacy') includeLegacy?: string,
  ) {
    if (!inventorySetupId) throw new BadRequestException('inventorySetupId query param is required');
    return this.inventoryService.findAllForSetup(inventorySetupId, includeLegacy === 'true');
  }

  // ─── Store-level inventory items (STORE_ADMIN / CASHIER) ──────────────────

  @Post('items')
  @ApiOperation({ summary: "Create an ad-hoc item and add it to the store's current inventory setup" })
  @ApiResponse({ status: 201, description: 'Inventory item created successfully' })
  createItem(@Body() createDto: CreateStoreInventoryItemDto, @TenantId() tenantId: string) {
    return this.inventoryService.createItem(createDto, tenantId);
  }

  @Get('items')
  @ApiOperation({ summary: "Get the store's inventory items — active (in the current setup) and legacy (has recorded history but not in the current setup)" })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter active items by category' })
  @ApiResponse({
    status: 200,
    description: 'Inventory items retrieved successfully',
  })
  findAllItems(
    @Query('categoryId') categoryId?: string,
    @TenantId() tenantId?: string,
  ) {
    return this.inventoryService.findAllItems(tenantId!, categoryId);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Get a single inventory item by ID (active or legacy)' })
  @ApiResponse({
    status: 200,
    description: 'Inventory item retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  findOneItem(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.inventoryService.findOneItem(id, tenantId);
  }

  @Patch('items/:id/store-config')
  @ApiOperation({ summary: 'Update store-specific thresholds (minStockLevel, expirationWarningDays) — STORE_ADMIN only' })
  updateStoreConfig(
    @Param('id') id: string,
    @Body() dto: UpdateStoreConfigDto,
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.updateStoreConfig(id, tenantId, dto);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: "Update an item's category/thresholds on this store's active setup" })
  @ApiResponse({
    status: 200,
    description: 'Inventory item updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  updateItem(
    @Param('id') id: string,
    @Body() updateDto: { categoryId?: string; minStockLevel?: number; requiresExpirationDate?: boolean; expirationWarningDays?: number },
    @TenantId() tenantId: string,
  ) {
    return this.inventoryService.updateItem(id, tenantId, updateDto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: "Remove an item from this store's active setup (preserved for history, not hard-deleted)" })
  @ApiResponse({
    status: 200,
    description: 'Inventory item removed successfully',
  })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  removeItem(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.inventoryService.removeItem(id, tenantId);
  }

  // Inventory Records Endpoints
  @SkipThrottle()
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

  @SkipThrottle()
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
    return this.inventoryService.getLatestInventory(tenantId!);
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
