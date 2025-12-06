import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateTransactionDto {
  @ApiProperty({
    example: 'Correction: Customer changed order after payment',
    required: false,
    description: 'Update or add remarks to the transaction',
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}
