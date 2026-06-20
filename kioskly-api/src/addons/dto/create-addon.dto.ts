import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AddonPriceTierDto {
  @ApiProperty({ example: '60d5f484f8d2e30015a0b1c2' })
  @IsString()
  @IsNotEmpty()
  tierId: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ example: 12 })
  @IsNumber()
  @IsOptional()
  foodpandaPrice?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsNumber()
  @IsOptional()
  grabPrice?: number;
}

export class CreateAddonDto {
  @ApiProperty({ example: 'nata-de-coco', required: false })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'Nata De Coco' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ example: 12 })
  @IsNumber()
  @IsOptional()
  foodpandaPrice?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsNumber()
  @IsOptional()
  grabPrice?: number;

  @ApiPropertyOptional({
    description: 'Per-tier pricing overrides',
    type: [AddonPriceTierDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddonPriceTierDto)
  @IsOptional()
  priceTiers?: AddonPriceTierDto[];
}
