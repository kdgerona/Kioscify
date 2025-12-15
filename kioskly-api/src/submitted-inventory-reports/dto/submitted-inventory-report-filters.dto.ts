import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmittedInventoryReportFiltersDto {
  @ApiProperty({ required: false, description: 'Filter by specific report date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  reportDate?: string;

  @ApiProperty({ required: false, description: 'Filter by start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'Filter by end date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;
}
