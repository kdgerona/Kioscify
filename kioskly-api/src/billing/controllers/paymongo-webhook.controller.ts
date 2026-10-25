import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { BillingWebhookService } from '../billing-webhook.service';

@ApiExcludeController()
@Controller('billing/webhooks')
export class PaymongoWebhookController {
  constructor(private webhooks: BillingWebhookService) {}

  @Post('paymongo')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  handle(@Req() req: Request & { rawBody?: Buffer }, @Headers('paymongo-signature') signature?: string) {
    return this.webhooks.handlePaymongo(req.rawBody, signature);
  }
}
