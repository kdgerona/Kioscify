import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsInt, Min } from 'class-validator';

// Ad-hoc item creation from the store side: creates a new brand-level master
// InventoryItem AND adds it to the requesting store's current InventorySetup
// in one step, since a bare master item with no setup membership would be
// invisible to the store that just created it.
export class CreateStoreInventoryItemDto {
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

  @ApiProperty({ example: '6a4df0aa1a7612aeaf989cf2', description: 'Category (type=INVENTORY), must belong to the store\'s current InventorySetup' })
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
