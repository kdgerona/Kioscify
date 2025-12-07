import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
} from 'class-validator';

export enum ExpenseCategory {
  SUPPLIES = 'SUPPLIES',
  UTILITIES = 'UTILITIES',
  RENT = 'RENT',
  SALARIES = 'SALARIES',
  MARKETING = 'MARKETING',
  MAINTENANCE = 'MAINTENANCE',
  TRANSPORTATION = 'TRANSPORTATION',
  MISCELLANEOUS = 'MISCELLANEOUS',
}

export class CreateExpenseDto {
  @ApiProperty({
    example: 'Purchased paper cups and lids',
    description: 'Description of the expense',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: 1500.50, description: 'Amount of the expense' })
  @IsNumber()
  amount: number;

  @ApiProperty({
    enum: ExpenseCategory,
    example: ExpenseCategory.SUPPLIES,
    description: 'Category of the expense',
  })
  @IsEnum(ExpenseCategory)
  category: ExpenseCategory;

  @ApiProperty({
    example: '2024-12-07T10:30:00Z',
    required: false,
    description: 'Date of the expense (defaults to now if not provided)',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({
    example: 'receipt-12345.jpg',
    required: false,
    description: 'Receipt image filename or URL',
  })
  @IsString()
  @IsOptional()
  receipt?: string;

  @ApiProperty({
    example: 'Paid via company credit card',
    required: false,
    description: 'Additional notes about the expense',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
