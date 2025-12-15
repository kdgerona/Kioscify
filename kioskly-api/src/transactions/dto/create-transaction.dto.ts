import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

class TransactionItemAddonDto {
  @ApiProperty({ example: 'nata-de-coco' })
  @IsString()
  @IsNotEmpty()
  addonId: string;
}

class TransactionItemDto {
  @ApiProperty({ example: 'lem-1' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  quantity: number;

  @ApiProperty({ example: 'regular-16oz', required: false })
  @IsString()
  @IsOptional()
  sizeId?: string;

  @ApiProperty({
    example: 98,
    description: 'Subtotal for this item (quantity * price)',
  })
  @IsNumber()
  subtotal: number;

  @ApiProperty({ type: [TransactionItemAddonDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemAddonDto)
  @IsOptional()
  addons?: TransactionItemAddonDto[];
}

export class CreateTransactionDto {
  @ApiProperty({ example: 'TXN172345678901234' })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({ example: 196 })
  @IsNumber()
  subtotal: number;

  @ApiProperty({ example: 196 })
  @IsNumber()
  total: number;

  @ApiProperty({
    enum: ['CASH', 'CARD', 'GCASH', 'PAYMAYA', 'ONLINE', 'FOODPANDA'],
    example: 'CASH',
  })
  @IsEnum(['CASH', 'CARD', 'GCASH', 'PAYMAYA', 'ONLINE', 'FOODPANDA'])
  paymentMethod: 'CASH' | 'CARD' | 'GCASH' | 'PAYMAYA' | 'ONLINE' | 'FOODPANDA';

  @ApiProperty({ example: 200, required: false })
  @IsNumber()
  @IsOptional()
  cashReceived?: number;

  @ApiProperty({ example: 4, required: false })
  @IsNumber()
  @IsOptional()
  change?: number;

  @ApiProperty({ example: 'REF123456789', required: false })
  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @ApiProperty({
    example: 'Customer requested refund - wrong order',
    required: false,
    description: 'Optional remarks or notes about the transaction',
  })
  @IsString()
  @IsOptional()
  remarks?: string;

  @ApiProperty({ type: [TransactionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items: TransactionItemDto[];
}
