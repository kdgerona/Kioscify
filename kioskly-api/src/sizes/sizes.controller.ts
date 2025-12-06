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
import { SizesService } from './sizes.service';
import { CreateSizeDto } from './dto/create-size.dto';
import { UpdateSizeDto } from './dto/update-size.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from 'src/common/decorators/tenant.decorator';

@ApiTags('sizes')
@Controller('sizes')
export class SizesController {
  constructor(private sizesService: SizesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new size (admin only)' })
  @ApiResponse({ status: 201, description: 'Size created successfully' })
  @ApiResponse({ status: 409, description: 'Size already exists' })
  create(@Body() createSizeDto: CreateSizeDto, @TenantId() tenantId: string) {
    return this.sizesService.create(createSizeDto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all sizes' })
  @ApiResponse({ status: 200, description: 'Sizes retrieved successfully' })
  findAll(@TenantId() tenantId: string) {
    return this.sizesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single size by ID' })
  @ApiResponse({ status: 200, description: 'Size retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Size not found' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.sizesService.findOne(id, tenantId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a size (admin only)' })
  @ApiResponse({ status: 200, description: 'Size updated successfully' })
  @ApiResponse({ status: 404, description: 'Size not found' })
  update(
    @Param('id') id: string,
    @Body() updateSizeDto: UpdateSizeDto,
    @TenantId() tenantId: string,
  ) {
    return this.sizesService.update(id, updateSizeDto, tenantId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a size (admin only)' })
  @ApiResponse({ status: 200, description: 'Size deleted successfully' })
  @ApiResponse({ status: 404, description: 'Size not found' })
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.sizesService.remove(id, tenantId);
  }
}
