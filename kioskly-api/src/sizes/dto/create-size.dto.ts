import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateSizeDto {
  @ApiProperty({ example: 'regular-16oz' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'Regular' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  priceModifier: number;

  @ApiProperty({ example: '16oz', required: false })
  @IsString()
  @IsOptional()
  volume?: string;
}
