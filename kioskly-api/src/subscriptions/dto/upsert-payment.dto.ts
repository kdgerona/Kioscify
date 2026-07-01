import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertPaymentDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  paid: boolean;

  @ApiPropertyOptional({ example: 'Paid via bank transfer' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
