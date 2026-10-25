import express from 'express';
import request from 'supertest';
import { jsonBodyParser } from './json-body-parser.util';

function app() {
  const a = express();
  a.use(jsonBodyParser());
  a.use((req, res) => {
    res.json({ body: req.body, raw: (req as typeof req & { rawBody?: Buffer }).rawBody?.toString() ?? null });
  });
  return a;
}

describe('jsonBodyParser', () => {
  const big = JSON.stringify({ pad: 'x'.repeat(300 * 1024) });

  it('keeps the raw body for billing webhooks', async () => {
    const res = await request(app()).post('/api/v1/billing/webhooks/paymongo').send({ a: 1 });
    expect(res.body).toEqual({ body: { a: 1 }, raw: '{"a":1}' });
  });

  it('rejects webhook bodies over 256 KB', async () => {
    const res = await request(app()).post('/api/v1/billing/webhooks/paymongo').set('Content-Type', 'application/json').send(big);
    expect(res.status).toBe(413);
  });

  it('other routes keep the 10 MB limit and no raw body', async () => {
    const res = await request(app()).post('/api/v1/transactions').set('Content-Type', 'application/json').send(big);
    expect(res.status).toBe(200);
    expect(res.body.raw).toBeNull();
  });
});
