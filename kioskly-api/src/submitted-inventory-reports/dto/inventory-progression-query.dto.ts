import { IsEnum, IsOptional, IsDateString, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ViewMode {
  DAY_OVER_DAY = 'day_over_day',
  WEEKLY_TREND = 'weekly_trend',
}

export class InventoryProgressionQueryDto {
  @ApiProperty({ enum: ViewMode, description: 'View mode for progression data' })
  @IsEnum(ViewMode)
  viewMode: ViewMode;

  @ApiProperty({ required: false, description: 'Start date for date range filter' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'End date for date range filter' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, description: 'Filter by inventory category' })
  @IsOptional()
  @IsString()
  categoryFilter?: string;
}
