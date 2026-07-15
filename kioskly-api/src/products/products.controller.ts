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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';


@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a product on a menu (admin only)' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 409, description: 'Product already exists' })
  @ApiQuery({ name: 'menuId', required: true })
  create(@Body() createProductDto: CreateProductDto, @Query('menuId') menuId: string) {
    return this.productsService.create(createProductDto, menuId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products — explicit menuId (admin/builder), or resolved from the requesting store (mobile/store portal)' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  @ApiQuery({ name: 'menuId', required: false })
  findAll(
    @Query('menuId') menuId: string,
    @TenantId() jwtTenantId: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.productsService.findAll({ menuId, categoryId, tenantId: jwtTenantId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product by ID with sizes and addons' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'menuId', required: false })
  findOne(
    @Param('id') id: string,
    @Query('menuId') menuId: string,
    @TenantId() jwtTenantId: string,
  ) {
    return this.productsService.findOne(id, { menuId, tenantId: jwtTenantId });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update a product's details on a menu (admin only)" })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'menuId', required: true })
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Query('menuId') menuId: string,
  ) {
    return this.productsService.update(id, updateProductDto, menuId);
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload product image (admin only)' })
  @ApiResponse({ status: 200, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  @ApiQuery({ name: 'menuId', required: true })
  async uploadImage(
    @Param('id') id: string,
    @Query('menuId') menuId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.productsService.updateImage(id, file, menuId);
  }

  @Delete(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove product image (admin only)' })
  @ApiResponse({ status: 200, description: 'Image removed successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'menuId', required: true })
  removeImage(
    @Param('id') id: string,
    @Query('menuId') menuId: string,
  ) {
    return this.productsService.removeImage(id, menuId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a product from a menu (admin only)' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'menuId', required: true })
  remove(
    @Param('id') id: string,
    @Query('menuId') menuId: string,
  ) {
    return this.productsService.remove(id, menuId);
  }
}
