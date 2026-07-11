import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MenusService } from './menus.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { CloneMenuDto } from './dto/clone-menu.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('menus')
@Controller('brands/:brandId/menus')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
@ApiBearerAuth()
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  @Get()
  @ApiOperation({ summary: 'List all menus for a brand' })
  findAll(@Param('brandId') brandId: string) {
    return this.menusService.findAllByBrand(brandId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a menu for a brand' })
  create(@Param('brandId') brandId: string, @Body() dto: CreateMenuDto) {
    return this.menusService.create(brandId, dto);
  }

  @Get(':menuId')
  @ApiOperation({ summary: 'Get a menu by id' })
  findOne(@Param('brandId') brandId: string, @Param('menuId') menuId: string) {
    return this.menusService.findOne(brandId, menuId);
  }

  @Patch(':menuId')
  @ApiOperation({ summary: 'Update a menu' })
  update(@Param('brandId') brandId: string, @Param('menuId') menuId: string, @Body() dto: UpdateMenuDto) {
    return this.menusService.update(brandId, menuId, dto);
  }

  @Delete(':menuId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a menu (blocked if assigned to any store)' })
  remove(@Param('brandId') brandId: string, @Param('menuId') menuId: string) {
    return this.menusService.remove(brandId, menuId);
  }

  @Post(':menuId/clone')
  @ApiOperation({ summary: 'Deep-clone a menu (categories, products, sizes, addons, preferences, price tiers)' })
  clone(@Param('brandId') brandId: string, @Param('menuId') menuId: string, @Body() dto: CloneMenuDto) {
    return this.menusService.clone(brandId, menuId, dto);
  }
}
