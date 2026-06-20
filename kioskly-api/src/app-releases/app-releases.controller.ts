import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AppReleasesService } from './app-releases.service';
import { CreateAppReleaseDto } from './dto/create-app-release.dto';
import { UpdateAppReleaseDto } from './dto/update-app-release.dto';

@ApiTags('app-releases')
@Controller('app-releases')
export class AppReleasesController {
  constructor(private readonly appReleasesService: AppReleasesService) {}

  @Post()
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a new APK release' })
  @UseInterceptors(
    FileInterceptor('apk', {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowed = [
          'application/vnd.android.package-archive',
          'application/octet-stream',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Only APK files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAppReleaseDto,
    @Request() req,
  ) {
    if (!file) throw new BadRequestException('APK file is required');
    return this.appReleasesService.create(file, dto, req.user.id);
  }

  @Get()
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all APK releases' })
  findAll() {
    return this.appReleasesService.findAll();
  }

  @Patch(':id')
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update release metadata' })
  update(@Param('id') id: string, @Body() dto: UpdateAppReleaseDto) {
    return this.appReleasesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('PLATFORM_ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a release and its APK file' })
  remove(@Param('id') id: string) {
    return this.appReleasesService.remove(id);
  }
}

@ApiTags('app')
@Controller('app')
export class AppVersionController {
  constructor(private readonly appReleasesService: AppReleasesService) {}

  @Get('version')
  @Public()
  @ApiOperation({ summary: 'Get latest published APK version (used by kiosk app)' })
  getLatestVersion() {
    return this.appReleasesService.findLatestPublished();
  }
}
