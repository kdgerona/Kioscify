import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  RewardProgramScope,
  RewardProgramStatus,
  RewardProgramType,
} from '@prisma/client';

export class CreateRewardProgramDto {
  @ApiProperty({ example: 'Blue Bear Cloud Club' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Collect stamps, earn free drinks' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    enum: RewardProgramType,
    example: RewardProgramType.LOYALTY_CARD,
  })
  @IsEnum(RewardProgramType)
  type: RewardProgramType;

  @ApiPropertyOptional({
    enum: RewardProgramStatus,
    default: RewardProgramStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(RewardProgramStatus)
  status?: RewardProgramStatus;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2027-01-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({
    description:
      'Type-specific config, validated by the type handler. LOYALTY_CARD: { slots: Slot[] }',
    example: {
      slots: [
        {
          key: 'r1c1',
          kind: 'STAMP',
          label: '₱49+',
          row: 0,
          position: 0,
          condition: { type: 'ITEM_MIN_PRICE', minPrice: 49 },
        },
        {
          key: 'm1',
          kind: 'MILESTONE',
          label: 'Cloud Break',
          row: 3,
          position: 0,
          reward: { type: 'PERCENT_OFF_ITEM', percent: 50 },
        },
      ],
    },
  })
  @IsObject()
  config: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Required for COMPANY_ADMIN (brand the program belongs to); ignored for STORE_ADMIN',
  })
  @IsOptional()
  @IsMongoId()
  brandId?: string;
}

export class UpdateRewardProgramDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ enum: RewardProgramStatus })
  @IsOptional()
  @IsEnum(RewardProgramStatus)
  status?: RewardProgramStatus;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO date, or null to clear',
  })
  @ValidateIf((o) => o.startsAt !== null && o.startsAt !== undefined)
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO date, or null to clear',
  })
  @ValidateIf((o) => o.endsAt !== null && o.endsAt !== undefined)
  @IsDateString()
  endsAt?: string | null;

  @ApiPropertyOptional({
    description: 'Full replacement config (validated by the type handler)',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class SetRewardProgramStoresDto {
  @ApiProperty({
    type: [String],
    description: 'Full set of enrolled store (tenant) ids; [] unenrolls all',
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsMongoId({ each: true })
  tenantIds: string[];
}

export class ListRewardProgramsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by brand (company/platform callers)',
  })
  @IsOptional()
  @IsMongoId()
  brandId?: string;

  @ApiPropertyOptional({ enum: RewardProgramStatus })
  @IsOptional()
  @IsEnum(RewardProgramStatus)
  status?: RewardProgramStatus;

  @ApiPropertyOptional({
    enum: RewardProgramScope,
    description:
      "Company/platform callers: default COMPANY. STORE lists the stores' own programs (read-only).",
  })
  @IsOptional()
  @IsEnum(RewardProgramScope)
  scope?: RewardProgramScope;

  @ApiPropertyOptional({ description: 'PLATFORM_ADMIN only: company to read' })
  @IsOptional()
  @IsMongoId()
  companyId?: string;
}

export class CompanyScopeQueryDto {
  @ApiPropertyOptional({ description: 'PLATFORM_ADMIN only: company to read' })
  @IsOptional()
  @IsMongoId()
  companyId?: string;
}
