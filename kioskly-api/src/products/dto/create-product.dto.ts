import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray } from 'class-validator';

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

  @ApiProperty({ example: 'lemonade' })
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
