import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AddonsService } from './addons.service';
import { CreateAddonDto } from './dto/create-addon.dto';
import { UpdateAddonDto } from './dto/update-addon.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('addons')
@Controller('addons')
export class AddonsController {
  constructor(private addonsService: AddonsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new addon (admin only)' })
  @ApiResponse({ status: 201, description: 'Addon created successfully' })
  @ApiResponse({ status: 409, description: 'Addon already exists' })
  create(@Body() createAddonDto: CreateAddonDto, @TenantId() tenantId: string) {
    return this.addonsService.create(createAddonDto, tenantId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all addons' })
  @ApiResponse({ status: 200, description: 'Addons retrieved successfully' })
  findAll(@TenantId() tenantId: string) {
    return this.addonsService.findAll(tenantId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single addon by ID' })
  @ApiResponse({ status: 200, description: 'Addon retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Addon not found' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.addonsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an addon (admin only)' })
  @ApiResponse({ status: 200, description: 'Addon updated successfully' })
  @ApiResponse({ status: 404, description: 'Addon not found' })
  update(
    @Param('id') id: string,
    @Body() updateAddonDto: UpdateAddonDto,
    @TenantId() tenantId: string,
  ) {
    return this.addonsService.update(id, updateAddonDto, tenantId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an addon (admin only)' })
  @ApiResponse({ status: 200, description: 'Addon deleted successfully' })
  @ApiResponse({ status: 404, description: 'Addon not found' })
  remove(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.addonsService.remove(id, tenantId);
  }
}
