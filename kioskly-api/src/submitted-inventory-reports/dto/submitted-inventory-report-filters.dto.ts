import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class SubmittedInventoryReportFiltersDto extends PaginationQueryDto {
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
