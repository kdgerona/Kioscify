import { IsDateString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetActivationDto {
  @ApiPropertyOptional({ example: '2026-01-15', nullable: true, description: 'ISO date string, or null to revert to Pending Activation' })
  @IsOptional()
  @IsDateString()
  activatedAt?: string | null;
}
