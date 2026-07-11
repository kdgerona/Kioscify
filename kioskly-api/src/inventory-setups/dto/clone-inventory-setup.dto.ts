import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CloneInventorySetupDto {
  @ApiPropertyOptional({
    example: 'Main Store Inventory (Copy)',
    description: 'Name for the cloned inventory setup. If omitted, generated from the source name with a "(Copy)" suffix.',
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Description override for the clone. If omitted, copied from the source.' })
  @IsString()
  @IsOptional()
  description?: string;
}
