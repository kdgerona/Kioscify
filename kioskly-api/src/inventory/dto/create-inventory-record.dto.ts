import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInventoryRecordDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'ID of the inventory item',
  })
  @IsString()
  @IsNotEmpty()
  inventoryItemId: string;

  @ApiProperty({
    example: 15.5,
    description: 'Quantity recorded',
  })
  @IsNumber()
  quantity: number;

  @ApiProperty({
    example: '2024-12-14T18:00:00Z',
    required: false,
    description: 'Date of the inventory count (defaults to now if not provided)',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({
    example: 'End of day count',
    required: false,
    description: 'Additional notes about the inventory record',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class BulkCreateInventoryRecordDto {
  @ApiProperty({
    type: [CreateInventoryRecordDto],
    description: 'Array of inventory records to create',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryRecordDto)
  records: CreateInventoryRecordDto[];
}
