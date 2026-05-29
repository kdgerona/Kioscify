import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
}

export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
