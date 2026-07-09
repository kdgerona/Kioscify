import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsInt, Min } from 'class-validator';

// Admin/builder creation — directly owned by the InventorySetup it's created
// under (mirrors CreateProductDto's direct Menu ownership).
export class CreateInventoryItemDto {
  @ApiProperty({ example: 'Fresh Lemons 138s|125s' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Box' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '6a4df0aa1a7612aeaf989cf2', description: 'Category (type=INVENTORY), must belong to the same InventorySetup' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({ example: 5 })
  @IsNumber()
  @IsOptional()
  minStockLevel?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  requiresExpirationDate?: boolean;

  @ApiPropertyOptional({ example: 7 })
  @IsInt()
  @Min(1)
  @IsOptional()
  expirationWarningDays?: number;
}
