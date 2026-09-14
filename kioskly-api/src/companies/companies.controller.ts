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
  Response,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response as ExpressResponse } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CompaniesService } from './companies.service';
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  OnboardAdminDto,
} from './dto/company.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrivilegeGuard } from '../common/guards/privilege.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePrivilege } from '../common/decorators/require-privilege.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AllowInGracePeriod } from '../common/decorators/allow-in-grace-period.decorator';
import { CompanyId } from '../common/decorators/tenant.decorator';
import { ExportService } from '../export/export.service';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(
    private companiesService: CompaniesService,
    private exportService: ExportService,
  ) {}

  @Get('validate-subdomain/:slug')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a company subdomain (public, rate-limited)' })
  @ApiResponse({ status: 200, description: 'Validation result' })
  validateSubdomain(@Param('slug') slug: string) {
    return this.companiesService.validateSubdomain(slug);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all companies (PLATFORM_ADMIN only)' })
  findAll() {
    return this.companiesService.findAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
  @Roles('COMPANY_ADMIN')
  @RequirePrivilege('settings', 'read')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own company (COMPANY_ADMIN)' })
  findOwn(@CompanyId() companyId: string) {
    return this.companiesService.findOne(companyId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get company by ID (PLATFORM_ADMIN)' })
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Get(':id/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COMPANY_ADMIN', 'PLATFORM_ADMIN')
  @AllowInGracePeriod()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Export a company's catalog (company info + per-brand categories/products/sizes/addons/preferences) as a ZIP. COMPANY_ADMIN limited to their own company; PLATFORM_ADMIN any company.",
  })
  async exportCompany(
    @Param('id') id: string,
    @Request() req,
    @Response() res: ExpressResponse,
  ) {
    if (req.user.role !== 'PLATFORM_ADMIN' && id !== req.user.companyId) {
      throw new ForbiddenException(
        'COMPANY_ADMIN can only export their own company',
      );
    }
    await this.exportService.streamCompanyExport(id, res);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a company (PLATFORM_ADMIN)' })
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @RequirePrivilege('settings', 'write')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update company (PLATFORM_ADMIN can change all fields; COMPANY_ADMIN can update basic info only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @Request() req,
  ) {
    return this.companiesService.update(id, dto, req.user.role);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a company (PLATFORM_ADMIN)' })
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }

  @Post(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a company and cascade to its active stores (PLATFORM_ADMIN)' })
  deactivate(@Param('id') id: string) {
    return this.companiesService.deactivate(id);
  }

  @Post(':id/reactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate a company and clear grace period on its cascaded stores (PLATFORM_ADMIN)' })
  reactivate(@Param('id') id: string) {
    return this.companiesService.reactivate(id);
  }

  @Post(':id/onboard-admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create first COMPANY_ADMIN user for a company (returns temporary password)' })
  onboardAdmin(@Param('id') id: string, @Body() dto: OnboardAdminDto) {
    return this.companiesService.onboardAdmin(id, dto);
  }

  @Post(':id/upload-logo')
  @UseGuards(JwtAuthGuard, RolesGuard, PrivilegeGuard)
  @Roles('PLATFORM_ADMIN', 'COMPANY_ADMIN')
  @RequirePrivilege('settings', 'write')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload company logo' })
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
        }
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadLogo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.companiesService.uploadLogo(id, file);
  }
}
