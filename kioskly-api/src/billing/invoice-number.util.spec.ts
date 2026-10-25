import { generateInvoiceNumber, generatePayToken } from './invoice-number.util';

describe('invoice numbers', () => {
  it('generateInvoiceNumber uses the Manila month', () => {
    expect(generateInvoiceNumber(new Date('2026-11-30T16:00:00.000Z'))).toMatch(/^KSF-202612-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it('pay tokens are long, url-safe and unique', () => {
    const a = generatePayToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(generatePayToken()).not.toBe(a);
  });
});
