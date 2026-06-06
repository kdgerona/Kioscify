import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsInt } from 'class-validator';

export class UpdateAddonDto {
  @ApiProperty({ example: 'Nata De Coco', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 10, required: false })
  @IsNumber()
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsNumber()
  @IsOptional()
  foodpandaPrice?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsNumber()
  @IsOptional()
  grabPrice?: number;

  @ApiProperty({ example: 1, required: false })
  @IsInt()
  @IsOptional()
  sequenceNo?: number;
}
