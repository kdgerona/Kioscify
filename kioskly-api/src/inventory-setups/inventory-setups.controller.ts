import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventorySetupsService } from './inventory-setups.service';
import { CreateInventorySetupDto } from './dto/create-inventory-setup.dto';
import { UpdateInventorySetupDto } from './dto/update-inventory-setup.dto';
import { UpsertTenantInventoryOverrideDto } from './dto/upsert-tenant-inventory-override.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('inventory-setups')
@Controller('brands/:brandId/inventory-setups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@ApiBearerAuth()
export class InventorySetupsController {
  constructor(private readonly inventorySetupsService: InventorySetupsService) {}

  @Get()
  @ApiOperation({ summary: 'List all inventory setups for a brand' })
  findAll(@Param('brandId') brandId: string) {
    return this.inventorySetupsService.findAllByBrand(brandId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an inventory setup for a brand' })
  create(@Param('brandId') brandId: string, @Body() dto: CreateInventorySetupDto) {
    return this.inventorySetupsService.create(brandId, dto);
  }

  @Get(':setupId')
  @ApiOperation({ summary: 'Get an inventory setup by id' })
  findOne(@Param('brandId') brandId: string, @Param('setupId') setupId: string) {
    return this.inventorySetupsService.findOne(brandId, setupId);
  }

  @Patch(':setupId')
  @ApiOperation({ summary: 'Update an inventory setup' })
  update(
    @Param('brandId') brandId: string,
    @Param('setupId') setupId: string,
    @Body() dto: UpdateInventorySetupDto,
  ) {
    return this.inventorySetupsService.update(brandId, setupId, dto);
  }

  @Delete(':setupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an inventory setup (blocked if assigned to any store)' })
  remove(@Param('brandId') brandId: string, @Param('setupId') setupId: string) {
    return this.inventorySetupsService.remove(brandId, setupId);
  }
}

// Separate top-level controller: a store admin tweaking their own store's
// thresholds isn't scoped by brandId/setupId in the URL — it's resolved from
// the authenticated tenant + the shared InventoryItem id alone.
@ApiTags('inventory-setups')
@Controller('inventory-items/:inventoryItemId/override')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STORE_ADMIN', 'PLATFORM_ADMIN')
@ApiBearerAuth()
export class TenantInventoryOverrideController {
  constructor(private readonly inventorySetupsService: InventorySetupsService) {}

  @Get()
  @ApiOperation({ summary: "Get the current store's override for this item, if any" })
  get(@TenantId() tenantId: string, @Param('inventoryItemId') inventoryItemId: string) {
    return this.inventorySetupsService.getOverride(tenantId, inventoryItemId);
  }

  @Patch()
  @ApiOperation({ summary: "Upsert the current store's threshold override for this item" })
  upsert(
    @TenantId() tenantId: string,
    @Param('inventoryItemId') inventoryItemId: string,
    @Body() dto: UpsertTenantInventoryOverrideDto,
  ) {
    return this.inventorySetupsService.upsertOverride(tenantId, inventoryItemId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Clear the current store's override, reverting to the shared item value" })
  clear(@TenantId() tenantId: string, @Param('inventoryItemId') inventoryItemId: string) {
    return this.inventorySetupsService.clearOverride(tenantId, inventoryItemId);
  }
}
