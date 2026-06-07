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
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { extname } from 'path';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BrandId } from '../common/decorators/tenant.decorator';

// Interface for uploaded file
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new product (admin only)' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 409, description: 'Product already exists' })
  @ApiQuery({ name: 'brandId', required: false })
  create(
    @Body() createProductDto: CreateProductDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.productsService.create(createProductDto, queryBrandId || jwtBrandId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  @ApiQuery({ name: 'brandId', required: false })
  findAll(
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.productsService.findAll(queryBrandId || jwtBrandId, categoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product by ID with sizes and addons' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'brandId', required: false })
  findOne(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.productsService.findOne(id, queryBrandId || jwtBrandId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product (admin only)' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'brandId', required: false })
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.productsService.update(id, updateProductDto, queryBrandId || jwtBrandId);
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      storage: diskStorage({
        destination: './uploads/products',
        filename: (
          req: Request,
          file: MulterFile,
          callback: (error: Error | null, filename: string) => void,
        ) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const productId = (req.params as { id?: string }).id || 'unknown';
          callback(null, `product-${productId}-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (
        req: Request,
        file: MulterFile,
        callback: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return callback(
            new BadRequestException('Only image files are allowed!'),
            false,
          );
        }
        callback(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  @ApiQuery({ name: 'brandId', required: false })
  async uploadImage(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
    @UploadedFile() file?: MulterFile,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const imageUrl = `/uploads/products/${file.filename}`;
    return this.productsService.updateImage(id, imageUrl, queryBrandId || jwtBrandId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a product (admin only)' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiQuery({ name: 'brandId', required: false })
  remove(
    @Param('id') id: string,
    @Query('brandId') queryBrandId: string,
    @BrandId() jwtBrandId: string,
  ) {
    return this.productsService.remove(id, queryBrandId || jwtBrandId);
  }
}
