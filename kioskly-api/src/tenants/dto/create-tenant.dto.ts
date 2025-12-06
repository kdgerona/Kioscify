import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ThemeColorsDto {
  @IsString()
  @IsOptional()
  primary?: string;

  @IsString()
  @IsOptional()
  secondary?: string;

  @IsString()
  @IsOptional()
  accent?: string;

  @IsString()
  @IsOptional()
  background?: string;

  @IsString()
  @IsOptional()
  text?: string;
}

export class CreateTenantDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  @IsOptional()
  themeColors?: ThemeColorsDto;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
