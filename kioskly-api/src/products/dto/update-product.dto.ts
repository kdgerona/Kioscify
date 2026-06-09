import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class UpdateProductDto {
  @ApiProperty({ example: 'Classic Lemonade', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 49, required: false })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: 55 })
  @IsNumber()
  @IsOptional()
  foodpandaPrice?: number;

  @ApiPropertyOptional({ example: 58 })
  @IsNumber()
  @IsOptional()
  grabPrice?: number;

  @ApiProperty({ example: 'lemonade', required: false })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiProperty({ example: 'https://example.com/image.jpg', required: false })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({
    example: ['regular-16oz', 'large-22oz'],
    required: false,
    type: [String]
  })
  @IsArray()
  @IsOptional()
  sizeIds?: string[];

  @ApiProperty({
    example: ['nata-de-coco', 'popping-bobba'],
    required: false,
    type: [String]
  })
  @IsArray()
  @IsOptional()
  addonIds?: string[];

  @ApiProperty({
    example: ['light-sweet', 'signature-sweetness'],
    required: false,
    type: [String]
  })
  @IsArray()
  @IsOptional()
  preferenceIds?: string[];
}
