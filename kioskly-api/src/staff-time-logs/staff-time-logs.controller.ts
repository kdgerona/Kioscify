import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { StaffTimeLogsService } from './staff-time-logs.service';
import { CreateStaffTimeLogDto } from './dto/create-staff-time-log.dto';
import { QueryStaffTimeLogDto } from './dto/query-staff-time-log.dto';
import { StorageService } from '../storage/storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant.decorator';

@ApiTags('staff-time-logs')
@Controller('staff-time-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StaffTimeLogsController {
  constructor(
    private staffTimeLogsService: StaffTimeLogsService,
    private storage: StorageService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CASHIER', 'STORE_ADMIN', 'ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Clock in/out with a selfie photo' })
  @ApiResponse({ status: 201, description: 'Time log recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid sequencing (e.g. TIME_IN after TIME_IN)' })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        cb(
          allowed.includes(file.mimetype)
            ? null
            : new BadRequestException('Only JPEG, PNG, WebP, and GIF images are allowed'),
          allowed.includes(file.mimetype),
        );
      },
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async create(
    @Body() createStaffTimeLogDto: CreateStaffTimeLogDto,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
    @TenantId() tenantId: string,
  ) {
    if (!file) throw new BadRequestException('No photo uploaded');

    // Validate sequencing before touching storage so a rejected request never leaves an
    // orphaned selfie file behind.
    await this.staffTimeLogsService.validateSequencing(tenantId, req.user.id, createStaffTimeLogDto.eventType);

    const filename = `staff-${req.user.id}-${Date.now()}${extname(file.originalname)}`;
    const photoUrl = await this.storage.upload('staff-selfies', filename, file.buffer, file.mimetype);

    return this.staffTimeLogsService.create(createStaffTimeLogDto, req.user.id, tenantId, photoUrl);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CASHIER', 'STORE_ADMIN', 'ADMIN')
  @ApiOperation({ summary: "Get the logged-in user's current clock-in/out state" })
  @ApiResponse({ status: 200, description: 'Current status retrieved successfully' })
  getStatus(@Request() req, @TenantId() tenantId: string) {
    return this.staffTimeLogsService.findStatus(tenantId, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_ADMIN', 'ADMIN')
  @ApiOperation({ summary: 'Paginated list of staff time logs for the store' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Time logs retrieved successfully' })
  findAll(@Query() query: QueryStaffTimeLogDto, @TenantId() tenantId: string) {
    return this.staffTimeLogsService.findAll(tenantId, query);
  }
}
