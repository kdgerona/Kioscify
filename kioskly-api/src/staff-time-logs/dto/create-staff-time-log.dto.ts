import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { TimeLogEventType } from '@prisma/client';

// Submitted as multipart/form-data alongside the `photo` file, so numeric
// fields arrive as strings — @Type(() => Number) converts them before
// validation runs (the global ValidationPipe does not enable implicit
// conversion, so this must be explicit per-field).
export class CreateStaffTimeLogDto {
  @ApiProperty({ enum: TimeLogEventType, example: TimeLogEventType.TIME_IN })
  @IsEnum(TimeLogEventType)
  eventType: TimeLogEventType;

  @ApiProperty({ example: 14.5995, description: 'Latitude captured at clock-in/out' })
  @Type(() => Number)
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: 120.9842, description: 'Longitude captured at clock-in/out' })
  @Type(() => Number)
  @IsNumber()
  longitude: number;
}
