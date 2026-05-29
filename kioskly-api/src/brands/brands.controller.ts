import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { BrandsService } from './brands.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CompanyId } from '../common/decorators/tenant.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('brands')
@Controller('brands')
export class BrandsController {
  constructor(
    private brandsService: BrandsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all brands for the requesting company' })
  findAll(@CompanyId() companyId: string) {
    return this.brandsService.findAllByCompany(companyId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single brand' })
  findOne(@Param('id') id: string, @CompanyId() companyId: string) {
    return this.brandsService.findOne(id, companyId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a brand (PLATFORM_ADMIN always; COMPANY_ADMIN only if canCreateBrands=true)' })
  async create(
    @Body() dto: CreateBrandDto,
    @CompanyId() companyId: string,
    @Request() req,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { canCreateBrands: true },
    });
    return this.brandsService.create(
      companyId,
      dto,
      req.user.role,
      company?.canCreateBrands ?? false,
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a brand' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
    @CompanyId() companyId: string,
  ) {
    return this.brandsService.update(id, companyId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a brand (PLATFORM_ADMIN only)' })
  remove(
    @Param('id') id: string,
    @CompanyId() companyId: string,
    @Request() req,
  ) {
    return this.brandsService.remove(id, companyId, req.user.role);
  }

  @Post(':id/upload-logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload brand logo' })
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = './uploads/logos';
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, `brand-${Date.now()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        cb(allowed.includes(file.mimetype) ? null : new Error('Invalid file type'), allowed.includes(file.mimetype));
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLogo(
    @Param('id') id: string,
    @CompanyId() companyId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.brandsService.uploadLogo(id, companyId, `/uploads/logos/${file.filename}`);
  }
}
