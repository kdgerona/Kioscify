import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsInt, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SizePriceTierDto } from './create-size.dto';

export class UpdateSizeDto {
  @ApiProperty({ example: 'Regular', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 0, required: false })
  @IsNumber()
  @IsOptional()
  priceModifier?: number;

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

  @ApiProperty({ example: 1, required: false })
  @IsInt()
  @IsOptional()
  sequenceNo?: number;

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
