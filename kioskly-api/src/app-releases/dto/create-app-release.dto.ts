import { IsString, IsInt, IsBoolean, IsEnum, IsArray, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum AppReleaseStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export class CreateAppReleaseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  versionName: string;

  @ApiProperty()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  versionCode: number;

  @ApiProperty({ type: [String], required: false })
  @Transform(({ value }) => {
    try { return JSON.parse(value); } catch { return []; }
  })
  @IsArray()
  @IsString({ each: true })
  releaseNotes: string[];

  @ApiProperty()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  forceUpdate: boolean;

  @ApiProperty({ enum: AppReleaseStatus })
  @IsEnum(AppReleaseStatus)
  status: AppReleaseStatus;
}
