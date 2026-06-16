import { IsString, IsBoolean, IsEnum, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AppReleaseStatus } from './create-app-release.dto';

export class UpdateAppReleaseDto {
  @ApiProperty({ type: [String], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  releaseNotes?: string[];

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  forceUpdate?: boolean;

  @ApiProperty({ enum: AppReleaseStatus, required: false })
  @IsEnum(AppReleaseStatus)
  @IsOptional()
  status?: AppReleaseStatus;
}
