// Adds the new `rewards` privilege section to existing restricted admins.
//
// Why: both portals treat a missing privilege section as `no_access`
// (kioscify-company/lib/privileges.ts, kioskly-admin/lib/privileges.ts). Every
// restricted (non-owner) admin created before the reward system has
// companyPrivileges / storePrivileges JSON without a `rewards` key, so the
// Rewards page would be hidden from them. New users already get
// `rewards: 'read'` from DEFAULT_PRIVILEGES / DEFAULT_STORE_PRIVILEGES.
//
// What it does: sets `rewards: 'read'` (the same default new users get) where
// the privilege object exists and has no `rewards` key. Owners
// (privileges = null, meaning full access) are not touched, and neither is
// anyone whose `rewards` was already set. An owner can raise a user to
// write/all from the portal's privileges editor afterwards.
//
// Run with mongosh against each environment's database:
//   mongosh "<DATABASE_URL>" docs/deployment/rewards-privileges.js            (apply)
//   mongosh "<DATABASE_URL>" --eval 'var DRY_RUN=true' docs/deployment/rewards-privileges.js
//
// Re-running is a no-op. Affected users must log out and back in: the portals
// read privileges from the login response.

const dryRun = typeof DRY_RUN !== 'undefined' && DRY_RUN === true;
const users = db.getCollection('users');

for (const field of ['companyPrivileges', 'storePrivileges']) {
  const filter = {
    [field]: { $type: 'object' },
    [`${field}.rewards`]: { $exists: false },
  };
  const count = users.countDocuments(filter);
  if (dryRun) {
    print(`dry-run  ${field}: ${count} user(s) would get rewards='read'`);
    continue;
  }
  const res = users.updateMany(filter, { $set: { [`${field}.rewards`]: 'read' } });
  print(`ok  ${field}: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
}
print(dryRun ? 'Dry run, nothing written.' : 'Done.');
