import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEmail, Matches, ValidateNested, IsArray, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryPlatform } from '@prisma/client';

class ThemeColorsDto {
  @IsString() @IsOptional() primary?: string;
  @IsString() @IsOptional() secondary?: string;
  @IsString() @IsOptional() accent?: string;
  @IsString() @IsOptional() background?: string;
  @IsString() @IsOptional() text?: string;
}

export class CreateStoreBillingDto {
  @ApiProperty({ example: 150000, description: 'Monthly subscription price in centavos (₱1,500 = 150000)' })
  @IsInt() @Min(1) priceCentavos: number;

  @ApiProperty({ example: 15 })
  @IsInt() @Min(0) @Max(365) trialDays: number;

  @ApiProperty({ example: '2026-11-08', description: 'Date the first invoice is created (Manila)' })
  @IsDateString() firstBillingDate: string;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsDateString() @IsOptional() activatedAt?: string;
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

  @ApiProperty({ type: CreateStoreBillingDto, description: 'New stores are billed automatically (price, trial and first billing date are required)' })
  @ValidateNested() @Type(() => CreateStoreBillingDto)
  billing: CreateStoreBillingDto;
}

// Billing is managed through /platform/subscriptions/:tenantId/billing, never PATCH /stores/:id.
export class UpdateStoreDto extends PartialType(OmitType(CreateStoreDto, ['billing'] as const)) {
  // isActive is intentionally NOT here — it must go through the dedicated
  // deactivate/reactivate endpoints so grace-period bookkeeping
  // (deactivatedAt/gracePeriodEndsAt/deactivationCascaded) can't be bypassed.

  @ApiPropertyOptional({ enum: DeliveryPlatform, isArray: true, example: ['FOODPANDA', 'GRAB'] })
  @IsArray()
  @IsEnum(DeliveryPlatform, { each: true })
  @IsOptional()
  enabledDeliveryPlatforms?: DeliveryPlatform[];

  @ApiPropertyOptional({ example: 'price-tier-id-here' })
  @IsString() @IsOptional() priceTierId?: string;

  @ApiPropertyOptional({ example: 'menu-id-here', description: 'Assign this store to a Menu — can be left unset and configured later' })
  @IsString() @IsOptional() menuId?: string;

  @ApiPropertyOptional({ example: 'inventory-setup-id-here', description: 'Assign this store to an InventorySetup — can be left unset and configured later' })
  @IsString() @IsOptional() inventorySetupId?: string;
}
