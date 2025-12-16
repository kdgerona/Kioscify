import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsDateString } from 'class-validator';

export enum VoidStatusFilter {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ALL = 'ALL',
}

export class VoidFiltersDto {
  @ApiProperty({
    enum: VoidStatusFilter,
    required: false,
    description: 'Filter by void status',
    default: VoidStatusFilter.PENDING,
  })
  @IsEnum(VoidStatusFilter)
  @IsOptional()
  status?: VoidStatusFilter = VoidStatusFilter.PENDING;

  @ApiProperty({ required: false, description: 'Filter from date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false, description: 'Filter to date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
