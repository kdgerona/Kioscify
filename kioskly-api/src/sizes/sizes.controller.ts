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
import { SizesService } from './sizes.service';
import { CreateSizeDto } from './dto/create-size.dto';
import { UpdateSizeDto } from './dto/update-size.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BrandId, TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('sizes')
@Controller('sizes')
export class SizesController {
  constructor(private sizesService: SizesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new size (admin only)' })
  @ApiResponse({ status: 201, description: 'Size created successfully' })
  @ApiResponse({ status: 409, description: 'Size already exists' })
  @ApiQuery({ name: 'brandId', required: false })
  create(
    @Body() createSizeDto: CreateSizeDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.sizesService.create(createSizeDto, queryBrandId || jwtBrandId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all sizes' })
  @ApiResponse({ status: 200, description: 'Sizes retrieved successfully' })
  @ApiQuery({ name: 'brandId', required: false })
  findAll(
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
    @TenantId() jwtTenantId: string,
  ) {
    return this.sizesService.findAll(queryBrandId || jwtBrandId, jwtTenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single size by ID' })
  @ApiResponse({ status: 200, description: 'Size retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Size not found' })
  @ApiQuery({ name: 'brandId', required: false })
  findOne(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
    @TenantId() jwtTenantId: string,
  ) {
    return this.sizesService.findOne(id, queryBrandId || jwtBrandId, jwtTenantId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a size (admin only)' })
  @ApiResponse({ status: 200, description: 'Size updated successfully' })
  @ApiResponse({ status: 404, description: 'Size not found' })
  @ApiQuery({ name: 'brandId', required: false })
  update(
    @Param('id') id: string,
    @Body() updateSizeDto: UpdateSizeDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.sizesService.update(id, updateSizeDto, queryBrandId || jwtBrandId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a size (admin only)' })
  @ApiResponse({ status: 200, description: 'Size deleted successfully' })
  @ApiResponse({ status: 404, description: 'Size not found' })
  @ApiQuery({ name: 'brandId', required: false })
  remove(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.sizesService.remove(id, queryBrandId || jwtBrandId);
  }
}
