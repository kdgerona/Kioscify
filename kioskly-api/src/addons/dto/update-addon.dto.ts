import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpdateAddonDto {
  @ApiProperty({ example: 'Nata De Coco', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 10, required: false })
  @IsNumber()
  @IsOptional()
  price?: number;
}
