import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
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
  create(@Body() dto: CreateCategoryDto, @BrandId() brandId: string) {
    return this.categoriesService.create(dto, brandId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all categories for the brand' })
  findAll(@BrandId() brandId: string, @TenantId() tenantId: string) {
    // Store users read via brandId derived from their JWT
    return this.categoriesService.findAll(brandId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category by ID' })
  findOne(@Param('id') id: string, @BrandId() brandId: string) {
    return this.categoriesService.findOne(id, brandId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Update a category (COMPANY_ADMIN only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @BrandId() brandId: string,
  ) {
    return this.categoriesService.update(id, dto, brandId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Delete a category (COMPANY_ADMIN only)' })
  remove(@Param('id') id: string, @BrandId() brandId: string) {
    return this.categoriesService.remove(id, brandId);
  }
}
