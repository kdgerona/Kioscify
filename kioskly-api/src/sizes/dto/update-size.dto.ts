import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpdateSizeDto {
  @ApiProperty({ example: 'Regular', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 0, required: false })
  @IsNumber()
  @IsOptional()
  priceModifier?: number;

  @ApiProperty({ example: '16oz', required: false })
  @IsString()
  @IsOptional()
  volume?: string;
}
