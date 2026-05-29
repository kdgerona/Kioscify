import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'StrongPass@1' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: 'mr-lemon-branch-1', description: 'Store slug (for store users)' })
  @IsString()
  @IsNotEmpty()
  storeSlug: string;

  @ApiPropertyOptional({ example: 'greatserve', description: 'Company slug (used to resolve store scope)' })
  @IsString()
  @IsOptional()
  companySlug?: string;
}

export class CompanyLoginDto {
  @ApiProperty({ example: 'company_admin' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'StrongPass@1' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: 'greatserve', description: 'Company slug (becomes subdomain)' })
  @IsString()
  @IsNotEmpty()
  companySlug: string;
}

export class PlatformLoginDto {
  @ApiProperty({ example: 'kevin' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'StrongPass@1' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class SwitchStoreDto {
  @ApiProperty({ description: 'ID of the store to switch to' })
  @IsString()
  @IsNotEmpty()
  targetStoreId: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPass@1' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewPass@1', minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'New password must be at least 10 characters' })
  newPassword: string;
}
