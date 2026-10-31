// Backfill: sets periodStart/periodEnd on prepayments recorded before those
// fields existed. DRY RUN by default; pass APPLY=true to write.
//
// Prepayments now show in the store's billing history (Store Portal and kiosk)
// with a receipt, both of which show the period paid for. New prepayments save
// it when recorded. Older ones only have it in the `payment.prepayment` audit
// log (after.paidThroughAt), so this copies it across. Until it runs, those rows
// still show, with a period estimated from the payment date.
//
// Matching: same store, same amount and months covered, the audit entry closest
// in time to the payment. Payments with no matching entry are listed and left alone.
// Safe to re-run: only touches prepayments that have no periodEnd yet.
//
//   mongosh "<DATABASE_URL>" --quiet --file docs/deployment/prepayment-periods-backfill.js                         # dry run
//   mongosh "<DATABASE_URL>" --quiet --eval 'var APPLY=true' --file docs/deployment/prepayment-periods-backfill.js  # write
//
// Same date math as kioskly-api/src/billing/prepayment-receipt.util.ts
// (Asia/Manila, fixed UTC+8): periodEnd = day after paid-through,
// periodStart = periodEnd minus monthsCovered months (same day, clamped to month end).

const apply = typeof APPLY !== 'undefined' && APPLY === true;
const OFFSET = 8 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
// Prisma stores Int fields as 64-bit (NumberLong / Long) while audit-log JSON holds plain
// numbers, so compare as plain numbers or nothing ever matches.
const num = v => (v == null ? NaN : typeof v === 'number' ? v : typeof v.toNumber === 'function' ? v.toNumber() : Number(v));
const day = d => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const startOfDay = d => {
  const z = new Date(d.getTime() + OFFSET);
  return new Date(Date.UTC(z.getUTCFullYear(), z.getUTCMonth(), z.getUTCDate()) - OFFSET);
};
const addMonthsClamped = (d, months, anchorDay) => {
  const z = new Date(d.getTime() + OFFSET);
  const y = z.getUTCFullYear();
  const m = z.getUTCMonth() + months;
  const daysInTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchorDay, daysInTarget)) - OFFSET);
};
const periodFor = (paidThroughAt, monthsCovered) => {
  const periodEnd = new Date(startOfDay(paidThroughAt).getTime() + DAY);
  const anchor = new Date(periodEnd.getTime() + OFFSET).getUTCDate();
  return { periodStart: addMonthsClamped(periodEnd, -monthsCovered, anchor), periodEnd };
};

print(`Prepayment period backfill${apply ? '' : ' (DRY RUN, pass APPLY=true to write)'}`);

const missing = db.billing_payments.find({ source: 'PREPAYMENT', periodEnd: null }).sort({ createdAt: 1 }).toArray();
print(`Prepayments missing a period: ${missing.length}`);

let updated = 0;
const skipped = [];
missing.forEach(p => {
  const t = db.tenants.findOne({ _id: p.tenantId }, { name: 1 });
  const store = t ? t.name : String(p.tenantId);
  const months = num(p.monthsCovered) || 1;
  const amount = num(p.amountCentavos);
  const match = db.billing_audit_logs
    .find({ tenantId: p.tenantId, action: 'payment.prepayment' })
    .toArray()
    .filter(l => l.after && num(l.after.amountCentavos) === amount && num(l.after.monthsCovered) === months && typeof l.after.paidThroughAt === 'string')
    .sort((a, b) => Math.abs(a.createdAt - p.createdAt) - Math.abs(b.createdAt - p.createdAt))[0];

  if (!match) {
    skipped.push(String(p._id));
    print(`  SKIP ${p._id} (${store}): no matching payment.prepayment audit entry`);
    return;
  }

  const { periodStart, periodEnd } = periodFor(new Date(match.after.paidThroughAt), months);
  print(`  ${p._id} (${store}): ${months} month(s), period ${day(periodStart)} – ${day(new Date(periodEnd.getTime() - 1))}`);
  if (apply) {
    db.billing_payments.updateOne({ _id: p._id, periodEnd: null }, { $set: { periodStart, periodEnd } });
    updated++;
  }
});

print(apply ? `Backfilled ${updated} prepayment(s).` : '(DRY RUN, no writes made)');
if (skipped.length) print(`Skipped ${skipped.length}: ${skipped.join(', ')}`);
