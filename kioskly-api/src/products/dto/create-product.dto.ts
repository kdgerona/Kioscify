import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductPriceTierDto {
  @ApiProperty({ example: '60d5f484f8d2e30015a0b1c2' })
  @IsString()
  @IsNotEmpty()
  tierId: string;

  @ApiProperty({ example: 49 })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ example: 55 })
  @IsNumber()
  @IsOptional()
  foodpandaPrice?: number;

  @ApiPropertyOptional({ example: 58 })
  @IsNumber()
  @IsOptional()
  grabPrice?: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'lem-1', required: false })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'Classic Lemonade' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 49 })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ example: 55 })
  @IsNumber()
  @IsOptional()
  foodpandaPrice?: number;

  @ApiPropertyOptional({ example: 58 })
  @IsNumber()
  @IsOptional()
  grabPrice?: number;

  @ApiProperty({ example: 'lemonade', description: 'Must belong to the same menu this product is being added to' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: 'https://example.com/image.jpg', required: false })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({
    example: ['regular-16oz', 'large-22oz'],
    required: false,
    type: [String],
    description: 'Must belong to the same menu',
  })
  @IsArray()
  @IsOptional()
  sizeIds?: string[];

  @ApiProperty({
    example: ['nata-de-coco', 'popping-bobba'],
    required: false,
    type: [String],
    description: 'Must belong to the same menu',
  })
  @IsArray()
  @IsOptional()
  addonIds?: string[];

  @ApiProperty({
    example: ['light-sweet', 'signature-sweetness'],
    required: false,
    type: [String],
    description: 'Must belong to the same menu',
  })
  @IsArray()
  @IsOptional()
  preferenceIds?: string[];

  @ApiPropertyOptional({
    description: 'Per-tier pricing overrides, scoped to this product-on-this-menu',
    type: [ProductPriceTierDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceTierDto)
  @IsOptional()
  priceTiers?: ProductPriceTierDto[];
}
