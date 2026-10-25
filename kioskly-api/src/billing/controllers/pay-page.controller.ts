import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { BillingPayService } from '../billing-pay.service';

/**
 * Backs the shareable /pay/<token> page. The token is per invoice and
 * unguessable; throttled because each view may create a PayMongo QR.
 */
@ApiTags('billing')
@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('billing/pay')
export class PayPageController {
  constructor(private pay: BillingPayService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Public pay page: invoice summary and a QR while it is open' })
  get(@Param('token') token: string) {
    return this.pay.payByToken(token);
  }

  @Get(':token/status')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public pay page payment-status poll' })
  status(@Param('token') token: string) {
    return this.pay.paymentStatus({ token });
  }
}
