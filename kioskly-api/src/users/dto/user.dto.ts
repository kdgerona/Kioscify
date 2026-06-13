import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, IsOptional, IsBoolean, IsEnum, Matches, IsObject } from 'class-validator';

export enum StoreUserRole {
  STORE_ADMIN = 'STORE_ADMIN',
  CASHIER = 'CASHIER',
}

export class CreateStoreUserDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'jane.doe@store.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'janedoe' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'Username must be alphanumeric' })
  username: string;

  @ApiProperty({ enum: StoreUserRole, default: StoreUserRole.CASHIER })
  @IsEnum(StoreUserRole)
  role: StoreUserRole;
}

export class UpdateStoreUserDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ enum: StoreUserRole })
  @IsEnum(StoreUserRole)
  @IsOptional()
  role?: StoreUserRole;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateCompanyUserDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'jane.doe@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'janedoe' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'Username must be alphanumeric' })
  username: string;

  @ApiPropertyOptional({
    description: 'Privilege levels per section. Omit to default to read for all sections.',
    example: { brands: 'read', analytics: 'no_access', users: 'read', settings: 'read' },
  })
  @IsOptional()
  @IsObject()
  companyPrivileges?: {
    brands: string;
    analytics: string;
    users: string;
    settings: string;
  };
}

export class UpdateCompanyUserDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Update privilege levels. Only admins with users:all can set this.',
    example: { brands: 'write', analytics: 'read', users: 'read', settings: 'no_access' },
  })
  @IsOptional()
  @IsObject()
  companyPrivileges?: {
    brands: string;
    analytics: string;
    users: string;
    settings: string;
  } | null;
}
