import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

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
}
