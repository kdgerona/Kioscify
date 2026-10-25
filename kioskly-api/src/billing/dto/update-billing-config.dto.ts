import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateBillingConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() billingEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enforcementEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(365) defaultTrialDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(60) defaultGraceDays?: number;

  @ApiPropertyOptional({ type: [Number], example: [0, 3, 7] })
  @IsOptional() @IsArray() @ArrayMaxSize(10)
  @IsInt({ each: true }) @Min(0, { each: true }) @Max(60, { each: true })
  reminderOffsets?: number[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(28) invoiceLeadDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) paymongoMonthlyLimitCentavos?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) limitWarnPercent?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(10) @Max(300) overduePollSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(14) claimLockHoldDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(1)
  minKioskVersionCode?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(280)
  fallbackQrAccountName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(280)
  fallbackQrInstructions?: string | null;

  @ApiPropertyOptional({ description: 'Must be true when turning enforcement on' })
  @IsOptional() @IsBoolean()
  confirmEnforcement?: boolean;
}
