import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export enum InventoryCategory {
  MAINS = 'MAINS',
  FLAVORED_JAMS = 'FLAVORED_JAMS',
  ADD_ONS = 'ADD_ONS',
  SYRUPS = 'SYRUPS',
  HOT = 'HOT',
  PACKAGING = 'PACKAGING',
}

export class CreateInventoryItemDto {
  @ApiProperty({
    example: 'Fresh Lemons 138s|125s',
    description: 'Name of the inventory item',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    enum: InventoryCategory,
    example: InventoryCategory.MAINS,
    description: 'Category of the inventory item',
  })
  @IsEnum(InventoryCategory)
  category: InventoryCategory;

  @ApiProperty({
    example: 'Box',
    description: 'Unit of measurement (Box, Bot, Jar, Pack, Tub, Roll, Pc)',
  })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({
    example: 'Fresh lemons for lemonade base',
    required: false,
    description: 'Description of the inventory item',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 5,
    required: false,
    description: 'Minimum stock level for alerts',
  })
  @IsNumber()
  @IsOptional()
  minStockLevel?: number;

  @ApiProperty({
    example: false,
    required: false,
    description: 'Whether this item requires expiration date tracking',
  })
  @IsBoolean()
  @IsOptional()
  requiresExpirationDate?: boolean;

  @ApiProperty({
    example: 7,
    required: false,
    description: 'Number of days before expiration to trigger warning alerts',
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  expirationWarningDays?: number;
}
