import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export class CreateInventoryItemDto {
  @ApiProperty({ example: 'Fresh Lemons 138s|125s' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Beverages', required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ example: 'Box' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 5, required: false })
  @IsNumber()
  @IsOptional()
  minStockLevel?: number;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  requiresExpirationDate?: boolean;

  @ApiProperty({ example: 7, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  expirationWarningDays?: number;
}
