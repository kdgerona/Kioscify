import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MANUAL_METHODS = ['cash', 'bank_transfer', 'bank_qr', 'gcash_direct', 'other'] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];

export class MarkPaidDto {
  @ApiProperty({ enum: MANUAL_METHODS }) @IsIn(MANUAL_METHODS) manualMethod: ManualMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) note?: string;
  @ApiPropertyOptional({ description: 'Defaults to now' }) @IsOptional() @IsDateString() paidAt?: string;
}

export class PrepaymentDto {
  @ApiProperty({ example: 450000 }) @IsInt() @Min(1) amountCentavos: number;
  @ApiProperty({ example: 3 }) @IsInt() @Min(1) @Max(36) monthsCovered: number;
  @ApiProperty({ example: '2026-12-31' }) @IsDateString() paidThroughAt: string;
  @ApiProperty({ example: '2027-01-01', description: 'Date the first platform invoice is created' }) @IsDateString() nextBillingAt: string;
  @ApiProperty({ enum: MANUAL_METHODS }) @IsIn(MANUAL_METHODS) manualMethod: ManualMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(280) note?: string;
}

export class ReasonDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(280) reason: string;
}

export class ExtendGraceDto {
  @ApiProperty({ example: '2026-12-01' }) @IsDateString() until: string;
}
