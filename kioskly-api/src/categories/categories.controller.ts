import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('categories')
@Controller('categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Create a category, scoped to a Menu (PRODUCT) or InventorySetup (INVENTORY)' })
  @ApiResponse({ status: 201, description: 'Category created' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get categories — explicit menuId/inventorySetupId (admin/builder), or resolved from the requesting store (mobile/store portal)' })
  @ApiQuery({ name: 'menuId', required: false })
  @ApiQuery({ name: 'inventorySetupId', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['PRODUCT', 'INVENTORY'] })
  findAll(
    @Query('menuId') menuId: string,
    @Query('inventorySetupId') inventorySetupId: string,
    @Query('type') type: 'PRODUCT' | 'INVENTORY' | undefined,
    @TenantId() tenantId: string,
  ) {
    return this.categoriesService.findAll({ menuId, inventorySetupId, type, tenantId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by ID' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Update a category (COMPANY_ADMIN only)' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Delete a category (COMPANY_ADMIN only)' })
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
