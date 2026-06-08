import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreatePreferenceDto {
  @ApiProperty({ example: 'light-sweet', required: false })
  @IsString()
  @IsOptional()
  id?: string;

  @ApiProperty({ example: 'Light Sweet (50%)' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
