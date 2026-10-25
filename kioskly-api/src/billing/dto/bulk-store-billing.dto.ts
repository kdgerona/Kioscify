import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';
import { UpdateStoreBillingDto } from './update-store-billing.dto';

export class BulkStoreBillingDto {
  @ApiProperty({ type: [String] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true })
  tenantIds: string[];

  @ApiProperty({ type: UpdateStoreBillingDto })
  @ValidateNested() @Type(() => UpdateStoreBillingDto)
  patch: UpdateStoreBillingDto;
}
