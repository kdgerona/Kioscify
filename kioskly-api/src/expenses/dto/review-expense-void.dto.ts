import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class ReviewExpenseVoidDto {
  @ApiProperty({
    example: 'Expense record is valid and required for accounting',
    description: 'Optional reason for rejection (required only if rejecting)',
    required: false,
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Rejection reason cannot exceed 500 characters' })
  rejectionReason?: string;
}
