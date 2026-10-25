import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const nullable = ValidateIf((_, v) => v !== null);

export class UpdateStoreBillingDto {
  @ApiPropertyOptional({ description: 'true = billed, false = exempt (requires exemptReason)' })
  @IsOptional() @IsBoolean()
  billingEnabled?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @nullable @IsString() @MaxLength(280)
  exemptReason?: string | null;

  @ApiPropertyOptional({ example: 150000, description: 'Monthly price in centavos (₱1,500 = 150000)' })
  @IsOptional() @IsInt() @Min(1)
  priceCentavos?: number;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @nullable @IsDateString() activatedAt?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @nullable @IsDateString() trialStartAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @nullable @IsInt() @Min(0) @Max(365)
  trialDays?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @nullable @IsInt() @Min(1) @Max(31)
  anchorDay?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Override: date the next invoice is created. null clears the override.' })
  @IsOptional() @nullable @IsDateString()
  nextBillingAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @nullable @IsInt() @Min(0) @Max(60)
  graceDaysOverride?: number | null;
}
