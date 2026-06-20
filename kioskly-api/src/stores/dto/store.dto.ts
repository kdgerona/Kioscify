import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEmail, Matches, ValidateNested, IsArray, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryPlatform } from '@prisma/client';

class ThemeColorsDto {
  @IsString() @IsOptional() primary?: string;
  @IsString() @IsOptional() secondary?: string;
  @IsString() @IsOptional() accent?: string;
  @IsString() @IsOptional() background?: string;
  @IsString() @IsOptional() text?: string;
}

export class CreateStoreDto {
  @ApiProperty({ example: 'Mr. Lemon Plus - Branch 1' })
  @IsString() @IsNotEmpty() name: string;

  @ApiProperty({ example: 'mr-lemon-branch-1', description: 'Unique within the company' })
  @IsString() @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  slug: string;

  @ApiProperty({ example: 'brand-id-here' })
  @IsString() @IsNotEmpty() brandId: string;

  @ApiProperty({ example: 'company-id-here' })
  @IsString() @IsNotEmpty() companyId: string;

  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional() @IsEmail() @IsOptional() contactEmail?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactPhone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address?: string;

  @ApiPropertyOptional()
  @ValidateNested() @Type(() => ThemeColorsDto) @IsOptional()
  themeColors?: ThemeColorsDto;
}

export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;

  @ApiPropertyOptional({ enum: DeliveryPlatform, isArray: true, example: ['FOODPANDA', 'GRAB'] })
  @IsArray()
  @IsEnum(DeliveryPlatform, { each: true })
  @IsOptional()
  enabledDeliveryPlatforms?: DeliveryPlatform[];

  @ApiPropertyOptional({ example: 'price-tier-id-here' })
  @IsString() @IsOptional() priceTierId?: string;
}
