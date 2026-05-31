import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, IsEnum, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryPlatform } from '@prisma/client';

export class ThemeColorsDto {
  @ApiPropertyOptional({ default: '#ea580c' }) @IsString() @IsOptional() primary?: string;
  @ApiPropertyOptional({ default: '#fb923c' }) @IsString() @IsOptional() secondary?: string;
  @ApiPropertyOptional({ default: '#fdba74' }) @IsString() @IsOptional() accent?: string;
  @ApiPropertyOptional({ default: '#ffffff' }) @IsString() @IsOptional() background?: string;
  @ApiPropertyOptional({ default: '#1f2937' }) @IsString() @IsOptional() text?: string;
}

export class CreateBrandDto {
  @ApiProperty({ example: 'Mr. Lemon Plus' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'mr-lemon-plus' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens only' })
  slug: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  @IsOptional()
  themeColors?: ThemeColorsDto;

  // Used by PLATFORM_ADMIN — COMPANY_ADMIN's companyId comes from JWT instead
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  companyId?: string;
}

export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: DeliveryPlatform, isArray: true, example: ['FOODPANDA', 'GRAB'] })
  @IsArray()
  @IsEnum(DeliveryPlatform, { each: true })
  @IsOptional()
  enabledDeliveryPlatforms?: DeliveryPlatform[];
}
