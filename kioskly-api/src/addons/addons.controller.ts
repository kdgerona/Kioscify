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
import { AddonsService } from './addons.service';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BrandId, TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('addons')
@Controller('addons')
export class AddonsController {
  constructor(private addonsService: AddonsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new addon (admin only)' })
  @ApiResponse({ status: 201, description: 'Addon created successfully' })
  @ApiResponse({ status: 409, description: 'Addon already exists' })
  @ApiQuery({ name: 'brandId', required: false })
  create(
    @Body() createAddonDto: CreateAddonDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.addonsService.create(createAddonDto, queryBrandId || jwtBrandId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all addons' })
  @ApiResponse({ status: 200, description: 'Addons retrieved successfully' })
  @ApiQuery({ name: 'brandId', required: false })
  findAll(
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
    @TenantId() jwtTenantId: string,
  ) {
    return this.addonsService.findAll(queryBrandId || jwtBrandId, jwtTenantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single addon by ID' })
  @ApiResponse({ status: 200, description: 'Addon retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Addon not found' })
  @ApiQuery({ name: 'brandId', required: false })
  findOne(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
    @TenantId() jwtTenantId: string,
  ) {
    return this.addonsService.findOne(id, queryBrandId || jwtBrandId, jwtTenantId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an addon (admin only)' })
  @ApiResponse({ status: 200, description: 'Addon updated successfully' })
  @ApiResponse({ status: 404, description: 'Addon not found' })
  @ApiQuery({ name: 'brandId', required: false })
  update(
    @Param('id') id: string,
    @Body() updateAddonDto: UpdateAddonDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.addonsService.update(id, updateAddonDto, queryBrandId || jwtBrandId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an addon (admin only)' })
  @ApiResponse({ status: 200, description: 'Addon deleted successfully' })
  @ApiResponse({ status: 404, description: 'Addon not found' })
  @ApiQuery({ name: 'brandId', required: false })
  remove(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.addonsService.remove(id, queryBrandId || jwtBrandId);
  }
}
