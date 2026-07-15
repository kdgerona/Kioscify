import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsInt,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HeldOrderItemDto } from './held-order-item.dto';

export class CreateHeldOrderDto {
  @ApiProperty({ example: 'Customer A', required: false })
  @IsString()
  @IsOptional()
  customerLabel?: string;

  @ApiProperty({ enum: ['regular', 'foodpanda', 'grab'], example: 'regular' })
  @IsIn(['regular', 'foodpanda', 'grab'])
  orderType: 'regular' | 'foodpanda' | 'grab';

  @ApiProperty({ example: 196 })
  @IsNumber()
  subtotal: number;

  @ApiProperty({ example: 196 })
  @IsNumber()
  total: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  itemCount: number;

  @ApiProperty({ type: [HeldOrderItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => HeldOrderItemDto)
  items: HeldOrderItemDto[];

  @ApiProperty({ example: 'uuid-v4-here', required: false, description: 'Device UUID for offline dedup, mirrors Transaction.clientId' })
  @IsString()
  @IsOptional()
  clientId?: string;
}
