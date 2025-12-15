import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
