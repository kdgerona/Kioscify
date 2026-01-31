import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ExpirationBatchDto {
  @ApiProperty({
    example: 10,
    description: 'Quantity in this batch',
  })
  @IsNumber()
  quantity: number;

  @ApiProperty({
    example: '2024-03-15T00:00:00.000Z',
    required: false,
    description: 'Expiration date for this batch (ISO 8601 format)',
  })
  @IsOptional()
  @IsDateString()
  expirationDate?: string;
}

export class InventoryItemSnapshotDto {
  @ApiProperty()
  @IsString()
  inventoryItemId: string;

  @ApiProperty()
  @IsString()
  itemName: string;

  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsString()
  unit: string;

  @ApiProperty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  minStockLevel?: number;

  @ApiProperty()
  @IsDateString()
  recordDate: string;

  @ApiProperty({
    required: false,
    description: 'Whether this item requires expiration date tracking',
  })
  @IsOptional()
  @IsBoolean()
  requiresExpirationDate?: boolean;

  @ApiProperty({
    required: false,
    description: 'Number of days before expiration to trigger warning alerts',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expirationWarningDays?: number;

  @ApiProperty({
    type: [ExpirationBatchDto],
    required: false,
    description: 'Batches with different expiration dates',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpirationBatchDto)
  expirationBatches?: ExpirationBatchDto[];
}

export class InventorySnapshotDto {
  @ApiProperty({ type: [InventoryItemSnapshotDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryItemSnapshotDto)
  items: InventoryItemSnapshotDto[];

  @ApiProperty()
  @IsNumber()
  totalItems: number;

  @ApiProperty()
  @IsString()
  submittedBy: string;
}

export class CreateSubmittedInventoryReportDto {
  @ApiProperty({ description: 'Report date in YYYY-MM-DD format' })
  @IsString()
  reportDate: string;

  @ApiProperty({ type: InventorySnapshotDto })
  @ValidateNested()
  @Type(() => InventorySnapshotDto)
  inventorySnapshot: InventorySnapshotDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, description: 'Replace existing report for the same date if it exists' })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}
