import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, IsNotEmpty } from 'class-validator';

export class AnalyticsQueryDto {
  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsISO8601()
  startDate: string;

  @ApiProperty({ example: '2026-06-30T23:59:59.999Z' })
  @IsISO8601()
  endDate: string;
}

export class TopProductsQueryDto extends AnalyticsQueryDto {
  @ApiProperty({ description: 'Brand ID to filter products by' })
  @IsString()
  @IsNotEmpty()
  brandId: string;
}
