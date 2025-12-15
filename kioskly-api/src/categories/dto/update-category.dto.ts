import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt } from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({ example: 'Lemonade', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'Refreshing lemonade drinks', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1, required: false })
  @IsInt()
  @IsOptional()
  sequenceNo?: number;
}
