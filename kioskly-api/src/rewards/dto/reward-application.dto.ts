import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { RewardEventType } from '@prisma/client';

const has = (v: unknown) => v !== undefined && v !== null;

// Cross-field shape per application type:
//   CARD_ISSUED     → no slotKey, itemIndex or discountAmount
//   STAMP_ADDED     → slotKey required; itemIndex optional (required by item conditions,
//                     checked by the handler); no discountAmount
//   REWARD_REDEEMED → slotKey, itemIndex and discountAmount all required
@ValidatorConstraint({ name: 'rewardApplicationShape', async: false })
class RewardApplicationShapeConstraint implements ValidatorConstraintInterface {
  validate(type: RewardEventType, args: ValidationArguments): boolean {
    const o = args.object as RewardApplicationDto;
    switch (type) {
      case RewardEventType.CARD_ISSUED:
        return !has(o.slotKey) && !has(o.itemIndex) && !has(o.discountAmount);
      case RewardEventType.STAMP_ADDED:
        return has(o.slotKey) && !has(o.discountAmount);
      case RewardEventType.REWARD_REDEEMED:
        return has(o.slotKey) && has(o.itemIndex) && has(o.discountAmount);
      default:
        return true; // @IsEnum reports unknown types
    }
  }

  defaultMessage(): string {
    return (
      'CARD_ISSUED takes no slotKey/itemIndex/discountAmount; STAMP_ADDED requires slotKey and ' +
      'takes no discountAmount; REWARD_REDEEMED requires slotKey, itemIndex and discountAmount'
    );
  }
}

/**
 * One reward applied to a transaction, sent by the kiosk inside
 * CreateTransactionDto.rewards. For REWARD_REDEEMED the kiosk must ALSO add
 * `discountAmount` to items[itemIndex].discountAmount.
 */
export class RewardApplicationDto {
  @ApiProperty({
    example: '665f1c2e9a1b2c3d4e5f6a7b',
    description: 'RewardProgram id',
  })
  @IsMongoId()
  programId: string;

  @ApiProperty({ enum: RewardEventType, example: RewardEventType.STAMP_ADDED })
  @IsEnum(RewardEventType)
  @Validate(RewardApplicationShapeConstraint)
  type: RewardEventType;

  @ApiPropertyOptional({
    example: 'r1c1',
    description: 'Slot key from the program config',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  slotKey?: string;

  @ApiPropertyOptional({
    example: 0,
    description: 'Index into the transaction items array',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  itemIndex?: number;

  @ApiPropertyOptional({
    example: 49,
    description: 'Reward discount on ONE unit (REWARD_REDEEMED only)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}
