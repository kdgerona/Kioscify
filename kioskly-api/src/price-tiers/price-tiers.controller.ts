import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PriceTiersService } from './price-tiers.service';
import { CreatePriceTierDto } from './dto/create-price-tier.dto';
import { UpdatePriceTierDto } from './dto/update-price-tier.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('price-tiers')
@Controller('brands/:brandId/price-tiers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@ApiBearerAuth()
export class PriceTiersController {
  constructor(private readonly priceTiersService: PriceTiersService) {}

  @Get()
  @ApiOperation({ summary: 'List all price tiers for a brand' })
  findAll(@Param('brandId') brandId: string) {
    return this.priceTiersService.findAllByBrand(brandId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a price tier for a brand' })
  create(
    @Param('brandId') brandId: string,
    @Body() dto: CreatePriceTierDto,
  ) {
    return this.priceTiersService.create(brandId, dto);
  }

  @Patch(':tierId')
  @ApiOperation({ summary: 'Update a price tier' })
  update(
    @Param('brandId') brandId: string,
    @Param('tierId') tierId: string,
    @Body() dto: UpdatePriceTierDto,
  ) {
    return this.priceTiersService.update(brandId, tierId, dto);
  }

  @Delete(':tierId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a price tier (blocked if assigned to any store)' })
  remove(
    @Param('brandId') brandId: string,
    @Param('tierId') tierId: string,
  ) {
    return this.priceTiersService.remove(brandId, tierId);
  }
}
