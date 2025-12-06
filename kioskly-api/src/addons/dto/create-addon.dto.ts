import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateAddonDto {
  @ApiProperty({ example: 'nata-de-coco' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 'Nata De Coco' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  price: number;
}
