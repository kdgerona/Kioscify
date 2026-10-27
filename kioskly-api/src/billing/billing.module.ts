import { Module } from '@nestjs/common';
import { BillingAuditService } from './billing-audit.service';
import { BillingConfigService } from './billing-config.service';
import { BillingSettingsService } from './billing-settings.service';
import { BillingStatusService } from './billing-status.service';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingPaymentsService } from './billing-payments.service';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import { PaymongoProvider } from './providers/paymongo.provider';
import { BillingWebhookService } from './billing-webhook.service';
import { PaymongoWebhookController } from './controllers/paymongo-webhook.controller';
import { BillingReconcileService } from './billing-reconcile.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingClaimsService } from './billing-claims.service';
import { BillingPayService } from './billing-pay.service';
import { BillingMeService } from './billing-me.service';
import { StoreBillingController } from './controllers/store-billing.controller';
import { PayPageController } from './controllers/pay-page.controller';
import { BillingRemindersService } from './billing-reminders.service';
import { InAppReminderChannel } from './reminders/in-app.channel';
import { REMINDER_CHANNELS } from './reminders/reminder-channel.interface';
import { PlatformBillingController, PlatformStoreBillingController } from './controllers/platform-billing.controller';
import { BillingResubscribeService } from './billing-resubscribe.service';

@Module({
  controllers: [
    PlatformBillingController,
    PlatformStoreBillingController,
    PaymongoWebhookController,
    StoreBillingController,
    PayPageController,
  ],
  providers: [
    BillingConfigService,
    BillingAuditService,
    BillingStatusService,
    BillingSettingsService,
    BillingInvoicesService,
    BillingPaymentsService,
    { provide: PAYMENT_PROVIDER, useClass: PaymongoProvider },
    BillingWebhookService,
    BillingReconcileService,
    BillingSchedulerService,
    BillingClaimsService,
    BillingPayService,
    BillingMeService,
    BillingRemindersService,
    BillingResubscribeService,
    InAppReminderChannel,
    { provide: REMINDER_CHANNELS, useFactory: (inApp: InAppReminderChannel) => [inApp], inject: [InAppReminderChannel] },
  ],
  exports: [BillingConfigService, BillingAuditService, BillingStatusService, BillingResubscribeService],
})
export class BillingModule {}
