import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsOptional, IsEnum } from 'class-validator';

export enum CategoryType {
  PRODUCT = 'PRODUCT',
  INVENTORY = 'INVENTORY',
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Lemonade' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Refreshing lemonade drinks', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1, required: false })
  @IsInt()
  @IsOptional()
  sequenceNo?: number;

  @ApiProperty({ enum: CategoryType, default: CategoryType.PRODUCT, required: false })
  @IsEnum(CategoryType)
  @IsOptional()
  type?: CategoryType;
}
