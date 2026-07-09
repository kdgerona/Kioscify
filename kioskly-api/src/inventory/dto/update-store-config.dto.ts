import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsInt, IsBoolean, Min, IsOptional } from 'class-validator';

export class UpdateStoreConfigDto {
  @ApiProperty({ example: 5, required: false })
  @IsNumber()
  @IsOptional()
  minStockLevel?: number;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  requiresExpirationDate?: boolean;

  @ApiProperty({ example: 7, required: false })
  @IsInt()
  @Min(1)
  @IsOptional()
  expirationWarningDays?: number;
}
