// Read-only: lists billed stores whose next billing date falls inside a
// period they have already paid (nextBillingAt <= paidThroughAt). Changes nothing.
//
// Before this release those stores could see "Subscription due" (or a reminder)
// for a month that was already paid, and the scheduler would invoice that month
// again. After it, the API treats their next billing date as the day after
// paid-through, so the banner clears and no duplicate invoice is issued.
//
// Run with mongosh against each environment's database:
//   mongosh "<DATABASE_URL>" --quiet docs/deployment/billing-dates-check.js
//
// Expected on a healthy database: "0 stores affected."

// Dates are stored as Manila midnight; print them as Manila calendar days
const day = d => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const affected = db.store_subscriptions
  .find({ billingEnabled: true, nextBillingAt: { $ne: null }, paidThroughAt: { $ne: null } })
  .toArray()
  .filter(s => s.nextBillingAt <= s.paidThroughAt);

affected.forEach(s => {
  const t = db.tenants.findOne({ _id: s.tenantId }, { name: 1, slug: 1 });
  const open = db.billing_invoices.find({ subscriptionId: s._id, status: 'OPEN' }, { number: 1, periodStart: 1 }).toArray();
  print(
    `${t ? t.name : s.tenantId} (${t ? t.slug : '?'})`,
    '| next billing', day(s.nextBillingAt),
    '| paid through', day(s.paidThroughAt),
    '| open invoices', open.length ? open.map(i => `${i.number} from ${day(i.periodStart)}`).join(', ') : 'none',
  );
});

print(`${affected.length} stores affected.`);
