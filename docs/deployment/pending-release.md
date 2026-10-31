# Release runbook: pending fixes

Running checklist for fixes that are **not deployed yet**. Each fix adds its own deploy steps
here, so a release is one pass through this file. Once a release is deployed, move this file to
`<name>-release-<date>.md` as a record and start a fresh one.

Previous releases (records only, nothing to re-run):
- `prepayment-history-release-2026-10-31.md`: prepayments in billing history, deployed 2026-10-31
- `store-fixes-release-2026-10-30.md`: store fixes 1–10, deployed 2026-10-30

Production: `docker-compose.yml`, project `kioscify-production`, server `/root/apps/Kioscify`
(SSH host `Kioscify-v2-Digital-Ocean-Server`).

## What's in this release

| # | Change | Branch / commit | Services | Data / scripts | Kiosk APK |
|---|---|---|---|---|---|

Nothing pending.

## Change log

- **2026-10-31**: Started fresh after the prepayments release was deployed.
