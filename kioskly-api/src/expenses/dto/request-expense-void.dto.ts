import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class RequestExpenseVoidDto {
  @ApiProperty({
    example: 'Expense was duplicated by mistake',
    description: 'Reason for requesting void',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Void reason must be at least 10 characters' })
  @MaxLength(500, { message: 'Void reason cannot exceed 500 characters' })
  reason: string;
}
