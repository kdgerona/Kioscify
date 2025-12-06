import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'lemonade' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'Lemonade' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
