import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsOptional } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'lemonade' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'Lemonade' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1, required: false })
  @IsInt()
  @IsOptional()
  sequenceNo?: number;
}
