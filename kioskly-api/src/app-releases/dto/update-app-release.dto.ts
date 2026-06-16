import { IsString, IsBoolean, IsEnum, IsArray, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED'], required: false })
  @IsEnum({ DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' })
  @IsOptional()
  status?: string;
}
