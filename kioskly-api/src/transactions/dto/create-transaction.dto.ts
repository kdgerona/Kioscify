import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  IsDateString,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';

const PAYMENT_METHODS = ['CASH', 'GCASH', 'PAYMAYA', 'ONLINE', 'FOODPANDA', 'GRAB', 'SPLIT'] as const;
type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

class PaymentSplitDto {
  @ApiProperty({ enum: PAYMENT_METHODS.filter((m) => m !== 'SPLIT'), example: 'CASH' })
  @IsEnum(PAYMENT_METHODS.filter((m) => m !== 'SPLIT'))
  method: Exclude<PaymentMethodValue, 'SPLIT'>;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: 100, required: false, description: 'Only for method == CASH' })
  @IsNumber()
  @IsOptional()
  cashReceived?: number;

  @ApiProperty({ example: 0, required: false, description: 'Only for method == CASH' })
  @IsNumber()
  @IsOptional()
  change?: number;

  @ApiProperty({ example: 'REF123456789', required: false, description: 'Required for non-cash methods' })
  @IsString()
  @IsOptional()
  referenceNumber?: string;
}

// Cross-field: paymentMethod === 'SPLIT' iff `payments` holds 2+ valid legs whose
// amounts sum to `total`. Keeps the two fields from ever disagreeing about
// whether a transaction is a split payment.
@ValidatorConstraint({ name: 'validPaymentSplits', async: false })
class ValidPaymentSplitsConstraint implements ValidatorConstraintInterface {
  validate(payments: PaymentSplitDto[] | undefined, args: ValidationArguments): boolean {
    const dto = args.object as CreateTransactionDto;
    const isSplit = dto.paymentMethod === 'SPLIT';

    if (!isSplit) {
      return !payments || payments.length === 0;
    }

    if (!payments || payments.length < 2) return false;

    const EPSILON = 0.01;
    for (const split of payments) {
      if (!(split.amount > 0)) return false;
      if (split.method === 'CASH') {
        if (split.cashReceived == null || split.cashReceived < split.amount) return false;
      } else if (!split.referenceNumber || !split.referenceNumber.trim()) {
        return false;
      }
    }

    const sum = payments.reduce((acc, split) => acc + split.amount, 0);
    return Math.abs(sum - dto.total) <= EPSILON;
  }

  defaultMessage(): string {
    return (
      'paymentMethod "SPLIT" requires a `payments` array of 2+ entries, each with amount > 0 ' +
      '(CASH entries need cashReceived >= amount, other methods need a referenceNumber), summing to `total`; ' +
      'non-"SPLIT" transactions must omit `payments`'
    );
  }
}

class TransactionItemAddonDto {
  @ApiProperty({ example: 'nata-de-coco' })
  @IsString()
  @IsNotEmpty()
  addonId: string;
}

class TransactionItemDto {
  @ApiProperty({ example: 'lem-1' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  quantity: number;

  @ApiProperty({ example: 'regular-16oz', required: false })
  @IsString()
  @IsOptional()
  sizeId?: string;

  @ApiProperty({ example: 'light-sweet', required: false })
  @IsString()
  @IsOptional()
  preferenceId?: string;

  @ApiProperty({
    example: 98,
    description: 'Subtotal for this item (quantity * price)',
  })
  @IsNumber()
  subtotal: number;

  @ApiProperty({ example: 10, required: false, description: 'Discount amount applied to this line item' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ type: [TransactionItemAddonDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemAddonDto)
  @IsOptional()
  addons?: TransactionItemAddonDto[];
}

export class CreateTransactionDto {
  @ApiProperty({ example: 'TXN172345678901234' })
  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @ApiProperty({ example: 196 })
  @IsNumber()
  subtotal: number;

  @ApiProperty({ example: 196 })
  @IsNumber()
  total: number;

  @ApiProperty({
    enum: PAYMENT_METHODS,
    example: 'CASH',
  })
  @IsEnum(PAYMENT_METHODS)
  paymentMethod: PaymentMethodValue;

  @ApiProperty({ example: 200, required: false })
  @IsNumber()
  @IsOptional()
  cashReceived?: number;

  @ApiProperty({ example: 4, required: false })
  @IsNumber()
  @IsOptional()
  change?: number;

  @ApiProperty({ example: 'REF123456789', required: false })
  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @ApiProperty({
    type: [PaymentSplitDto],
    required: false,
    description: 'Populate only when paymentMethod is "SPLIT" (2+ payment methods combined for one checkout)',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentSplitDto)
  @IsOptional()
  @Validate(ValidPaymentSplitsConstraint)
  payments?: PaymentSplitDto[];

  @ApiProperty({
    example: 'Customer requested refund - wrong order',
    required: false,
    description: 'Optional remarks or notes about the transaction',
  })
  @IsString()
  @IsOptional()
  remarks?: string;

  @ApiProperty({ example: 10, required: false, description: 'Discount amount applied to the transaction' })
  @IsNumber()
  @IsOptional()
  discountAmount?: number;

  @ApiProperty({ type: [TransactionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items: TransactionItemDto[];

  @ApiProperty({ example: 'uuid-v4-here', required: false, description: 'Device UUID for offline deduplication' })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiProperty({
    example: '2024-01-15T10:30:00.000Z',
    required: false,
    description: 'Actual transaction time captured on-device (preserves creation time for offline sync)',
  })
  @IsDateString()
  @IsOptional()
  timestamp?: string;
}
