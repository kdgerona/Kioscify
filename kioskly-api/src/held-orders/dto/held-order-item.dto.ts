import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  IsIn,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HeldOrderItemAddonDto {
  @ApiProperty({ example: 'nata-de-coco' })
  @IsString()
  @IsNotEmpty()
  addonId: string;

  @ApiProperty({ example: 'Nata de Coco' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 15 })
  @IsNumber()
  price: number;
}

export class HeldOrderItemDiscountDto {
  @ApiProperty({ enum: ['percentage', 'amount'] })
  @IsIn(['percentage', 'amount'])
  mode: 'percentage' | 'amount';

  @ApiProperty({ required: false, example: 10 })
  @IsNumber()
  @IsOptional()
  percentage?: number;

  @ApiProperty({ required: false, example: '10' })
  @IsString()
  @IsOptional()
  customAmount?: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  amount: number;
}

export class HeldOrderItemDto {
  @ApiProperty({ example: '1717000000000', description: 'Mirrors OrderItem.id from the mobile cart' })
  @IsString()
  @IsNotEmpty()
  localId: string;

  @ApiProperty({ example: 'lem-1' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 'Calamansi Lemonade' })
  @IsString()
  @IsNotEmpty()
  productName: string;

  @ApiProperty({ example: 49 })
  @IsNumber()
  productPrice: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  quantity: number;

  @ApiProperty({ example: 'regular-16oz', required: false })
  @IsString()
  @IsOptional()
  sizeId?: string;

  @ApiProperty({ example: '16oz', required: false })
  @IsString()
  @IsOptional()
  sizeName?: string;

  @ApiProperty({ example: 10, required: false })
  @IsNumber()
  @IsOptional()
  sizePriceModifier?: number;

  @ApiProperty({ example: 'light-sweet', required: false })
  @IsString()
  @IsOptional()
  preferenceId?: string;

  @ApiProperty({ example: 'Light Sweet', required: false })
  @IsString()
  @IsOptional()
  preferenceName?: string;

  @ApiProperty({ type: [HeldOrderItemAddonDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeldOrderItemAddonDto)
  addons: HeldOrderItemAddonDto[];

  @ApiProperty({ required: false, type: HeldOrderItemDiscountDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeldOrderItemDiscountDto)
  itemDiscount?: HeldOrderItemDiscountDto;
}
