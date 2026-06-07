import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsInt, Min, IsOptional } from 'class-validator';

export class UpdateStoreConfigDto {
  @ApiProperty({ example: 5, required: false })
  @IsNumber()
  @IsOptional()
  minStockLevel?: number;

  @ApiProperty({ example: 7, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  expirationWarningDays?: number;
}
