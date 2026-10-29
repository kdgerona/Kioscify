// Read-only: how each store pays for its subscription. Changes nothing.
//
// From this release, stores set up for the first time pay for each month at
// its end (a Dec 10 bill covers Nov 10 – Dec 9). Every store already billed,
// exempt, prepaid or with a month ticked paid in the manual ledger keeps
// paying in advance (a Dec 10 bill covers Dec 10 – Jan 9).
//
// Run with mongosh against each environment's database:
//   mongosh "<DATABASE_URL>" --quiet docs/deployment/billing-timing-check.js
//
// Expected right after deploying: "End of month: 0" (nothing is switched by the
// deploy itself), and every billed store listed under "In advance".

const name = id => {
  const t = db.tenants.findOne({ _id: id }, { name: 1 });
  return t ? t.name : String(id);
};
const subs = db.store_subscriptions.find().toArray();
const bySub = new Set(subs.map(s => String(s.tenantId)));
const arrears = subs.filter(s => s.billedInArrears === true);
const advance = subs.filter(s => s.billedInArrears !== true && s.billingEnabled != null);
const notSetUp = subs.filter(s => s.billedInArrears !== true && s.billingEnabled == null);
const noRow = db.tenants.find({ tombstone: { $ne: 1 } }, { name: 1 }).toArray().filter(t => !bySub.has(String(t._id)));

// A "Not set up" store that has paid before stays in advance when set up
const keepsAdvance = s =>
  !!s.paidThroughAt ||
  db.billing_invoices.countDocuments({ subscriptionId: s._id }) > 0 ||
  db.subscription_payments.countDocuments({ subscriptionId: s._id, paid: true }) > 0;

print(`End of month: ${arrears.length}`);
arrears.forEach(s => print(`  ${name(s.tenantId)}`));
print(`In advance (unchanged): ${advance.length}`);
advance.forEach(s => print(`  ${name(s.tenantId)} (${s.billingEnabled ? 'billed' : 'exempt'})`));
print(`Not set up yet: ${notSetUp.length + noRow.length}`);
notSetUp.forEach(s => print(`  ${name(s.tenantId)}: ${keepsAdvance(s) ? 'has paid before, stays in advance when set up' : 'end of month when set up'}`));
noRow.forEach(t => print(`  ${t.name}: end of month when set up`));
