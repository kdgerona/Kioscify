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
import { PreferencesService } from './preferences.service';
import { CreatePreferenceDto } from './dto/create-preference.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BrandId } from '../common/decorators/tenant.decorator';

@ApiTags('preferences')
@Controller('preferences')
export class PreferencesController {
  constructor(private preferencesService: PreferencesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new preference (admin only)' })
  @ApiResponse({ status: 201, description: 'Preference created successfully' })
  @ApiResponse({ status: 409, description: 'Preference already exists' })
  @ApiQuery({ name: 'brandId', required: false })
  create(
    @Body() createPreferenceDto: CreatePreferenceDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.preferencesService.create(createPreferenceDto, queryBrandId || jwtBrandId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all preferences' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved successfully' })
  @ApiQuery({ name: 'brandId', required: false })
  findAll(
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.preferencesService.findAll(queryBrandId || jwtBrandId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single preference by ID' })
  @ApiResponse({ status: 200, description: 'Preference retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Preference not found' })
  @ApiQuery({ name: 'brandId', required: false })
  findOne(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.preferencesService.findOne(id, queryBrandId || jwtBrandId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a preference (admin only)' })
  @ApiResponse({ status: 200, description: 'Preference updated successfully' })
  @ApiResponse({ status: 404, description: 'Preference not found' })
  @ApiQuery({ name: 'brandId', required: false })
  update(
    @Param('id') id: string,
    @Body() updatePreferenceDto: UpdatePreferenceDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.preferencesService.update(id, updatePreferenceDto, queryBrandId || jwtBrandId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a preference (admin only)' })
  @ApiResponse({ status: 200, description: 'Preference deleted successfully' })
  @ApiResponse({ status: 404, description: 'Preference not found' })
  @ApiQuery({ name: 'brandId', required: false })
  remove(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.preferencesService.remove(id, queryBrandId || jwtBrandId);
  }
}
