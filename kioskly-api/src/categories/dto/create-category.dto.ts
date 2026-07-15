import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsOptional, IsEnum, ValidateIf } from 'class-validator';

export enum CategoryType {
  PRODUCT = 'PRODUCT',
  INVENTORY = 'INVENTORY',
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Lemonade' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Refreshing lemonade drinks', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1, required: false })
  @IsInt()
  @IsOptional()
  sequenceNo?: number;

  @ApiProperty({ enum: CategoryType, default: CategoryType.PRODUCT, required: false })
  @IsEnum(CategoryType)
  @IsOptional()
  type?: CategoryType;

  // Exactly one of these two is required, matching `type` (PRODUCT -> menuId,
  // INVENTORY -> inventorySetupId) — a Category now belongs to a Menu or an
  // InventorySetup, never a bare Brand. Immutable after creation (not present
  // on UpdateCategoryDto).
  @ApiProperty({ example: '6a4def324e15d835b3b26141', required: false, description: 'Required when type is PRODUCT (or omitted)' })
  @ValidateIf((o) => o.type !== CategoryType.INVENTORY)
  @IsString()
  @IsNotEmpty()
  menuId?: string;

  @ApiProperty({ example: '6a4df0aa1a7612aeaf989cf2', required: false, description: 'Required when type is INVENTORY' })
  @ValidateIf((o) => o.type === CategoryType.INVENTORY)
  @IsString()
  @IsNotEmpty()
  inventorySetupId?: string;
}
