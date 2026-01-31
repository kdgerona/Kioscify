import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsDateString } from 'class-validator';

export enum ExpenseVoidStatusFilter {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ALL = 'ALL',
}

export class ExpenseVoidFiltersDto {
  @ApiProperty({
    enum: ExpenseVoidStatusFilter,
    required: false,
    description: 'Filter by void status',
    default: ExpenseVoidStatusFilter.PENDING,
  })
  @IsEnum(ExpenseVoidStatusFilter)
  @IsOptional()
  status?: ExpenseVoidStatusFilter = ExpenseVoidStatusFilter.PENDING;

  @ApiProperty({ required: false, description: 'Filter from date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false, description: 'Filter to date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
