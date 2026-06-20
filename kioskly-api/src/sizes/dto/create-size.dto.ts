import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SizePriceTierDto {
  @ApiProperty({ example: '60d5f484f8d2e30015a0b1c2' })
  @IsString()
  @IsNotEmpty()
  tierId: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  priceModifier: number;

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsOptional()
  foodpandaPrice?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsOptional()
  grabPrice?: number;
}

export class CreateSizeDto {
  @ApiProperty({ example: 'regular-16oz', required: false })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'Regular' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  priceModifier: number;

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsOptional()
  foodpandaPrice?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsNumber()
  @IsOptional()
  grabPrice?: number;

  @ApiProperty({ example: '16oz', required: false })
  @IsString()
  @IsOptional()
  volume?: string;

  @ApiPropertyOptional({
    description: 'Per-tier pricing overrides',
    type: [SizePriceTierDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SizePriceTierDto)
  @IsOptional()
  priceTiers?: SizePriceTierDto[];
}
