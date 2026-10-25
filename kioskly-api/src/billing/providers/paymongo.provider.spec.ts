import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymongoProvider } from './paymongo.provider';
import { PaymentProviderError } from './payment-provider.interface';

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

const makeProvider = (env: Record<string, string | undefined>) =>
  new PaymongoProvider({ get: (k: string) => env[k] } as any);

const testEnv = { PAYMONGO_SECRET_KEY: 'sk_test_abc', PAYMONGO_WEBHOOK_SECRET: 'whsk_test' };
const liveEnv = { PAYMONGO_SECRET_KEY: 'sk_live_abc', PAYMONGO_WEBHOOK_SECRET: 'whsk_live' };

const sign = (secret: string, t: number, body: string) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

// The documented payment.paid example (trimmed).
const paidEvent = JSON.stringify({
  data: {
    id: 'evt_XNQTT6J64gkTwBhrJiZmf9BZ',
    type: 'event',
    attributes: {
      type: 'payment.paid',
      livemode: false,
      data: {
        id: 'pay_vNQdh3edhpd8MJdPmHjYqPMB',
        type: 'payment',
        attributes: {
          amount: 150000,
          currency: 'PHP',
          payment_intent_id: 'pi_sucFg8XMEGq1234m8eNuseyt',
          status: 'paid',
          metadata: { invoiceId: 'inv-1', tenantId: 't-1' },
          paid_at: 1739167186,
        },
      },
    },
  },
});

describe('PaymongoProvider', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  it('mode follows the secret key prefix', () => {
    expect(makeProvider(testEnv).mode()).toBe('test');
    expect(makeProvider(liveEnv).mode()).toBe('live');
    expect(makeProvider({}).mode()).toBe('unconfigured');
  });

  describe('createQrCharge', () => {
    it('creates an intent, a qrph method (30 min expiry) and attaches it, using the secret key', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-16T02:00:00.000Z'));
      fetchMock
        .mockResolvedValueOnce(json(200, { data: { id: 'pi_1', attributes: { client_key: 'pi_1_client_x', livemode: false } } }))
        .mockResolvedValueOnce(json(200, { data: { id: 'pm_1' } }))
        .mockResolvedValueOnce(
          json(200, { data: { id: 'pi_1', attributes: { status: 'awaiting_next_action', next_action: { code: { image_url: 'data:image/png;base64,QR' } } } } }),
        );

      const r = await makeProvider(testEnv).createQrCharge({
        amountCentavos: 150000,
        description: 'Kioscify subscription KSF-202611-ABCDE',
        metadata: { invoiceId: 'inv-1', tenantId: 't-1' },
      });

      expect(r).toEqual({
        providerIntentId: 'pi_1',
        qrImage: 'data:image/png;base64,QR',
        expiresAt: new Date('2026-11-16T02:30:00.000Z'),
        livemode: false,
      });
      const [intentUrl, intentInit] = fetchMock.mock.calls[0];
      expect(intentUrl).toBe('https://api.paymongo.com/v1/payment_intents');
      expect(intentInit.headers.Authorization).toBe(`Basic ${Buffer.from('sk_test_abc:').toString('base64')}`);
      expect(JSON.parse(intentInit.body)).toEqual({
        data: {
          attributes: {
            amount: 150000,
            currency: 'PHP',
            payment_method_allowed: ['qrph'],
            description: 'Kioscify subscription KSF-202611-ABCDE',
            metadata: { invoiceId: 'inv-1', tenantId: 't-1' },
          },
        },
      });
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.paymongo.com/v1/payment_methods');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ data: { attributes: { type: 'qrph', expiry_seconds: 1800 } } });
      expect(fetchMock.mock.calls[2][0]).toBe('https://api.paymongo.com/v1/payment_intents/pi_1/attach');
      expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ data: { attributes: { payment_method: 'pm_1', client_key: 'pi_1_client_x' } } });
      jest.useRealTimers();
    });

    const attachWithTestUrl = (livemode: boolean) => [
      json(200, { data: { id: 'pi_1', attributes: { client_key: 'pi_1_client_x', livemode } } }),
      json(200, { data: { id: 'pm_1' } }),
      json(200, {
        data: {
          id: 'pi_1',
          attributes: {
            livemode,
            next_action: { code: { image_url: 'data:image/png;base64,QR', test_url: 'https://test.paymongo.com/qrph/pi_1' } },
          },
        },
      }),
    ];

    it('in test mode, logs the test_url PayMongo returns for simulating the payment', async () => {
      attachWithTestUrl(false).forEach(r => fetchMock.mockResolvedValueOnce(r));
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await makeProvider(testEnv).createQrCharge({ amountCentavos: 100, description: 'x', metadata: { invoiceId: 'i', tenantId: 't' } });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('https://test.paymongo.com/qrph/pi_1'));
      log.mockRestore();
    });

    it('never logs a test_url in live mode', async () => {
      attachWithTestUrl(true).forEach(r => fetchMock.mockResolvedValueOnce(r));
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await makeProvider(liveEnv).createQrCharge({ amountCentavos: 100, description: 'x', metadata: { invoiceId: 'i', tenantId: 't' } });
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });

    it('gives up on a PayMongo call that hangs, so Pay now can fall back to the bank QR', async () => {
      jest.useFakeTimers();
      try {
        fetchMock.mockImplementation(
          (_url: string, init: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
            }),
        );
        const pending = makeProvider(testEnv).createQrCharge({ amountCentavos: 100, description: 'x', metadata: { invoiceId: 'i', tenantId: 't' } });
        const assertion = expect(pending).rejects.toThrow(new PaymentProviderError('PayMongo did not respond in time'));
        await jest.advanceTimersByTimeAsync(15_000);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    it('throws PaymentProviderError with the PayMongo error detail on 4xx', async () => {
      fetchMock.mockResolvedValueOnce(json(400, { errors: [{ code: 'parameter_invalid', detail: 'amount is invalid' }] }));
      const err = await makeProvider(testEnv)
        .createQrCharge({ amountCentavos: 1, description: 'x', metadata: { invoiceId: 'i', tenantId: 't' } })
        .catch(e => e);
      expect(err).toBeInstanceOf(PaymentProviderError);
      expect(err.message).toBe('amount is invalid');
      expect(err.status).toBe(400);
    });

    it('unconfigured key throws 503', async () => {
      await expect(
        makeProvider({}).createQrCharge({ amountCentavos: 1, description: 'x', metadata: { invoiceId: 'i', tenantId: 't' } }),
      ).rejects.toThrow(new ServiceUnavailableException('Online payment is not configured'));
      await expect(makeProvider({}).getChargeStatus('pi_1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('getChargeStatus', () => {
    it('maps succeeded with the first payment', async () => {
      fetchMock.mockResolvedValueOnce(
        json(200, {
          data: {
            id: 'pi_1',
            attributes: {
              status: 'succeeded',
              payments: [{ id: 'pay_1', attributes: { amount: 150000, paid_at: 1739167186 } }],
            },
          },
        }),
      );
      await expect(makeProvider(testEnv).getChargeStatus('pi_1')).resolves.toEqual({
        status: 'succeeded',
        paymentId: 'pay_1',
        amountCentavos: 150000,
        paidAt: new Date(1739167186 * 1000),
      });
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.paymongo.com/v1/payment_intents/pi_1');
    });

    it.each([
      ['awaiting_next_action', 'pending'],
      ['processing', 'pending'],
      ['awaiting_payment_method', 'failed'],
    ])('maps %s → %s', async (raw, mapped) => {
      fetchMock.mockResolvedValueOnce(json(200, { data: { id: 'pi_1', attributes: { status: raw } } }));
      await expect(makeProvider(testEnv).getChargeStatus('pi_1')).resolves.toEqual({ status: mapped });
    });
  });

  describe('verifyWebhook', () => {
    const now = new Date(1_800_000_000 * 1000);
    const t = 1_800_000_000;

    it('accepts a valid te signature in test mode', () => {
      const header = `t=${t},te=${sign('whsk_test', t, paidEvent)},li=`;
      expect(makeProvider(testEnv).verifyWebhook(Buffer.from(paidEvent), header, now)).toBe(true);
    });

    it('accepts a valid li signature in live mode', () => {
      const header = `t=${t},te=,li=${sign('whsk_live', t, paidEvent)}`;
      expect(makeProvider(liveEnv).verifyWebhook(Buffer.from(paidEvent), header, now)).toBe(true);
    });

    it('rejects te in live mode', () => {
      const header = `t=${t},te=${sign('whsk_live', t, paidEvent)},li=`;
      expect(makeProvider(liveEnv).verifyWebhook(Buffer.from(paidEvent), header, now)).toBe(false);
    });

    it('rejects a tampered body', () => {
      const header = `t=${t},te=${sign('whsk_test', t, paidEvent)},li=`;
      expect(makeProvider(testEnv).verifyWebhook(Buffer.from(paidEvent.replace('150000', '1')), header, now)).toBe(false);
    });

    it('rejects a timestamp more than 5 minutes off', () => {
      const stale = t - 301;
      const header = `t=${stale},te=${sign('whsk_test', stale, paidEvent)},li=`;
      expect(makeProvider(testEnv).verifyWebhook(Buffer.from(paidEvent), header, now)).toBe(false);
    });

    it.each([undefined, '', 'garbage', 't=abc,te=zz'])('rejects a missing or malformed header (%s)', header => {
      expect(makeProvider(testEnv).verifyWebhook(Buffer.from(paidEvent), header, now)).toBe(false);
    });

    it('rejects when no webhook secret is configured', () => {
      const header = `t=${t},te=${sign('whsk_test', t, paidEvent)},li=`;
      expect(makeProvider({ PAYMONGO_SECRET_KEY: 'sk_test_abc' }).verifyWebhook(Buffer.from(paidEvent), header, now)).toBe(false);
    });

    it('rejects a signature made with the public .env.example placeholder secret', () => {
      const placeholder = '<PAYMONGO_WEBHOOK_SECRET>';
      const header = `t=${t},te=${sign(placeholder, t, paidEvent)},li=`;
      const provider = makeProvider({ PAYMONGO_SECRET_KEY: 'sk_test_abc', PAYMONGO_WEBHOOK_SECRET: placeholder });
      expect(provider.verifyWebhook(Buffer.from(paidEvent), header, now)).toBe(false);
    });
  });

  it('parseEvent reads the documented payment.paid payload', () => {
    expect(makeProvider(testEnv).parseEvent(Buffer.from(paidEvent))).toEqual({
      eventId: 'evt_XNQTT6J64gkTwBhrJiZmf9BZ',
      type: 'payment.paid',
      livemode: false,
      providerIntentId: 'pi_sucFg8XMEGq1234m8eNuseyt',
      paymentId: 'pay_vNQdh3edhpd8MJdPmHjYqPMB',
      amountCentavos: 150000,
      paidAt: new Date(1739167186 * 1000),
      invoiceId: 'inv-1',
    });
  });

  it('parseEvent takes the intent id from a payment_intent resource', () => {
    const body = JSON.stringify({ data: { id: 'evt_2', attributes: { type: 'qrph.expired', livemode: false, data: { id: 'pi_9', type: 'payment_intent', attributes: {} } } } });
    expect(makeProvider(testEnv).parseEvent(Buffer.from(body))).toMatchObject({ eventId: 'evt_2', type: 'qrph.expired', providerIntentId: 'pi_9' });
  });
});
