import { Injectable } from '@nestjs/common';
import { ReminderChannel } from './reminder-channel.interface';

/** In-app reminders need no push: the stored row is surfaced by GET billing/me. */
@Injectable()
export class InAppReminderChannel implements ReminderChannel {
  readonly name = 'in_app';

  async deliver(): Promise<void> {}
}
