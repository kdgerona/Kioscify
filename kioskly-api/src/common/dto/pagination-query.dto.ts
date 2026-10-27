import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_PAGE_SIZE } from '../utils/pagination';

/**
 * `page`/`limit` for list endpoints that take a filters DTO. Extend it so the
 * whitelisting ValidationPipe accepts the params. See common/utils/pagination.ts.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    example: 1,
    description:
      'Page number (1-based). When set, the response is { data, pagination } instead of a plain array',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10, description: `Page size when paginating (default 50, max ${MAX_PAGE_SIZE})` })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}
