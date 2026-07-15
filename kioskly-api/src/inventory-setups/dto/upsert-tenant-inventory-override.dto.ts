import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class UpsertTenantInventoryOverrideDto {
  @ApiPropertyOptional({ example: 15, description: 'Omit to leave this field following the shared setup value' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minStockLevel?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  requiresExpirationDate?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @Min(0)
  @IsOptional()
  expirationWarningDays?: number;
}
