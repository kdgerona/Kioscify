import {
  IsString,
  IsOptional,
  IsDateString,
  ValidateNested,
  IsArray,
  IsNumber,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PaymentMethodBreakdownItem {
  @ApiProperty()
  @IsNumber()
  total: number;

  @ApiProperty()
  @IsNumber()
  count: number;
}

class SalesSnapshotDto {
  @ApiProperty()
  @IsNumber()
  totalAmount: number;

  @ApiProperty()
  @IsNumber()
  transactionCount: number;

  @ApiProperty()
  @IsNumber()
  averageTransaction: number;

  @ApiProperty()
  @IsNumber()
  totalItemsSold: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  paymentMethodBreakdown: Record<string, PaymentMethodBreakdownItem>;
}

class CategoryBreakdownItem {
  @ApiProperty()
  @IsNumber()
  total: number;

  @ApiProperty()
  @IsNumber()
  count: number;
}

class ExpensesSnapshotDto {
  @ApiProperty()
  @IsNumber()
  totalAmount: number;

  @ApiProperty()
  @IsNumber()
  expenseCount: number;

  @ApiProperty()
  @IsNumber()
  averageExpense: number;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  categoryBreakdown: Record<string, CategoryBreakdownItem>;
}

class SummarySnapshotDto {
  @ApiProperty()
  @IsNumber()
  grossProfit: number;

  @ApiProperty()
  @IsNumber()
  profitMargin: number;

  @ApiProperty()
  @IsNumber()
  netRevenue: number;
}

export class CreateSubmittedReportDto {
  @ApiProperty({
    description: 'Report date in YYYY-MM-DD format',
    example: '2024-12-14',
  })
  @IsString()
  reportDate: string;

  @ApiProperty({ description: 'Start of period covered' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ description: 'End of period covered' })
  @IsDateString()
  periodEnd: string;

  @ApiProperty({ type: SalesSnapshotDto })
  @ValidateNested()
  @Type(() => SalesSnapshotDto)
  salesSnapshot: SalesSnapshotDto;

  @ApiProperty({ type: ExpensesSnapshotDto })
  @ValidateNested()
  @Type(() => ExpensesSnapshotDto)
  expensesSnapshot: ExpensesSnapshotDto;

  @ApiProperty({ type: SummarySnapshotDto })
  @ValidateNested()
  @Type(() => SummarySnapshotDto)
  summarySnapshot: SummarySnapshotDto;

  @ApiProperty({
    description: 'Array of transaction IDs included in this report',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  transactionIds: string[];

  @ApiProperty({
    description: 'Array of expense IDs included in this report',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  expenseIds: string[];

  @ApiPropertyOptional({ description: 'Optional notes or remarks' })
  @IsOptional()
  @IsString()
  notes?: string;
}
