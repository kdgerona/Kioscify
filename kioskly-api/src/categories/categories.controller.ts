import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BrandId, TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('categories')
@Controller('categories')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Create a category (brand-scoped, COMPANY_ADMIN only)' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiQuery({ name: 'brandId', required: false })
  create(
    @Body() dto: CreateCategoryDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.categoriesService.create(dto, queryBrandId || jwtBrandId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all categories for the brand' })
  @ApiQuery({ name: 'brandId', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['PRODUCT', 'INVENTORY'] })
  findAll(
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
    @TenantId() tenantId: string,
    @Query('type') type?: 'PRODUCT' | 'INVENTORY',
  ) {
    return this.categoriesService.findAll(queryBrandId || jwtBrandId, type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by ID' })
  @ApiQuery({ name: 'brandId', required: false })
  findOne(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.categoriesService.findOne(id, queryBrandId || jwtBrandId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Update a category (COMPANY_ADMIN only)' })
  @ApiQuery({ name: 'brandId', required: false })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.categoriesService.update(id, dto, queryBrandId || jwtBrandId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Delete a category (COMPANY_ADMIN only)' })
  @ApiQuery({ name: 'brandId', required: false })
  remove(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.categoriesService.remove(id, queryBrandId || jwtBrandId);
  }
}
