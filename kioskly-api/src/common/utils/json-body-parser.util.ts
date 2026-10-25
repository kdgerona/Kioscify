import * as express from 'express';
import type { RequestHandler } from 'express';

const WEBHOOK_PATH = '/billing/webhooks/';

/**
 * JSON body parsing with an explicit 10 MB limit (NestJS's default is
 * unlimited). Billing webhooks get a small limit — provider events are a
 * few KB — and keep the raw bytes, since their signatures are computed over
 * the exact body sent.
 */
export function jsonBodyParser(): RequestHandler {
  const webhookJson = express.json({
    limit: '256kb',
    verify: (req, _res, buf) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = buf;
    },
  });
  const json = express.json({ limit: '10mb' });
  return (req, res, next) => (req.url?.includes(WEBHOOK_PATH) ? webhookJson : json)(req, res, next);
}
