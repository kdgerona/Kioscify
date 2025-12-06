import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateCategoryDto {
  @ApiProperty({ example: 'Lemonade', required: false })
  @IsString()
  @IsOptional()
  name?: string;
}
