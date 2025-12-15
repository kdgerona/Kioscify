import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsOptional } from 'class-validator';

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
}
