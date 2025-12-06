import { ApiProperty } from '@nestjs/swagger';
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
}
