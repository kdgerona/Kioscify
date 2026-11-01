import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RewardEventType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class RewardEventsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Store (tenant) id. Ignored for store users (always their own store).',
  })
  @IsOptional()
  @IsMongoId()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  programId?: string;

  @ApiPropertyOptional({ enum: RewardEventType })
  @IsOptional()
  @IsEnum(RewardEventType)
  type?: RewardEventType;

  @ApiPropertyOptional({ description: 'occurredAt >= startDate (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'occurredAt <= endDate (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Include events of voided transactions (default false)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeVoided?: boolean;

  @ApiPropertyOptional({
    description:
      'Only events recorded with validation warnings (default false)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  onlyFlagged?: boolean;

  @ApiPropertyOptional({ description: 'PLATFORM_ADMIN only: company to read' })
  @IsOptional()
  @IsMongoId()
  companyId?: string;
}
