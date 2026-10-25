import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SubmitClaimDto {
  // Multipart bodies arrive as strings.
  @ApiProperty({ example: 150000 }) @Type(() => Number) @IsInt() @Min(1) amountCentavos: number;
  @ApiProperty({ example: 'BPI-7781234' }) @IsString() @IsNotEmpty() @MaxLength(100) reference: string;
  @ApiProperty({ example: '2026-11-17T02:00:00.000Z' }) @IsDateString() paidAt: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) note?: string;
}
