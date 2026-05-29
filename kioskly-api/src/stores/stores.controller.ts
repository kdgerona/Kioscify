import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiQuery,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { StoresService } from './stores.service';
import { CreateStoreDto, UpdateStoreDto } from './dto/store.dto';
import { OnboardAdminDto } from '../companies/dto/company.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CompanyId, TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('stores')
@Controller('stores')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StoresController {
  constructor(private storesService: StoresService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @ApiOperation({ summary: 'List all stores (filtered by company for COMPANY_ADMIN)' })
  findAll(@CompanyId() companyId: string, @Request() req) {
    const filterCompanyId = req.user.role === 'PLATFORM_ADMIN' ? undefined : companyId;
    return this.storesService.findAll(filterCompanyId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current store (for store users)' })
  findOwn(@TenantId() tenantId: string) {
    return this.storesService.findOne(tenantId);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get store by slug (used by mobile app login)' })
  @ApiQuery({ name: 'companySlug', required: false })
  findBySlug(@Param('slug') slug: string, @Query('companySlug') companySlug?: string) {
    return this.storesService.findBySlug(slug, companySlug);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'STORE_ADMIN')
  @ApiOperation({ summary: 'Get store by ID' })
  findOne(@Param('id') id: string) {
    return this.storesService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @ApiOperation({ summary: 'Create a store (PLATFORM_ADMIN always; COMPANY_ADMIN if canOnboardStores=true)' })
  create(@Body() dto: CreateStoreDto, @Request() req, @CompanyId() companyId: string) {
    return this.storesService.create(dto, req.user.role, companyId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'STORE_ADMIN')
  @ApiOperation({ summary: 'Update a store' })
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.storesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiOperation({ summary: 'Delete a store (PLATFORM_ADMIN only)' })
  remove(@Param('id') id: string) {
    return this.storesService.remove(id);
  }

  @Post(':id/onboard-admin')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @ApiOperation({ summary: 'Create first STORE_ADMIN user (returns temporary password)' })
  onboardAdmin(@Param('id') id: string, @Body() dto: OnboardAdminDto) {
    return this.storesService.onboardAdmin(id, dto);
  }

  @Post(':id/upload-logo')
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'STORE_ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload store logo' })
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = './uploads/logos';
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, `store-${Date.now()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        cb(allowed.includes(file.mimetype) ? null : new Error('Invalid file type'), allowed.includes(file.mimetype));
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    return this.storesService.uploadLogo(id, `/uploads/logos/${file.filename}`);
  }
}
