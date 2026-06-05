# Inventory Screen Redesign

**Date:** 2026-06-05
**App:** kioskly-app (React Native / Expo)
**File:** `kioskly-app/app/inventory.tsx`

## Problem

The current inventory screen is a single long scrollable form with every item fully expanded inline. For 50+ items — most requiring expiry date tracking with multiple batches per item — the page becomes an overwhelming wall of inputs. Cashiers (lower-skilled staff doing daily stock counts) struggle to navigate it, especially the inline batch entry for expiry items.

## Design Decision

Replace the flat form with a **list + bottom sheet** pattern:

- Main screen: scannable list of items grouped by category, one row per item
- Tapping an item opens a focused bottom sheet for that item only
- Cashier works through items one at a time
- Progress indicator shows how many items have been counted

No changes to the data model, API calls, submission logic, or offline sync behavior. This is a pure UI restructure.

---

## Main List Screen

### Layout
- Header: "Daily Inventory" + today's date
- Last Submission Banner (existing `LastSubmissionBanner` component, unchanged)
- Progress pill: `"X / N counted"` — updates live as items are counted
- Items grouped by category with section headers (same grouping logic as current)
- Pull-to-refresh (unchanged)
- Submit button: fixed at bottom, hidden until at least 1 item is counted

### Item Row
Each row is a tappable card showing:
- **Left:** item name (bold) + unit (small, gray, below name)
- **Center:** last count grayed out as a soft reference (e.g., `"last: 8 kg"`)
- **Right:** status dot + chevron

**When counted:** checkmark replaces the status dot; entered total shown in primary color.

### Status Dot Colors
| State | Dot |
|---|---|
| Not yet counted, no expiry | Gray |
| Not yet counted, has expiry | Hollow circle (draws attention) |
| Counted, all batches ok | Green |
| Counted, some in warning range | Yellow |
| Counted, some expiring within 3 days | Orange |
| Counted, at least one batch expired | Red |

---

## Bottom Sheet — Simple Item

Opens when a non-expiry item row is tapped.

### Layout
- Drag handle at top
- Item name (bold) + category badge
- Previous count shown as soft reference: `"Previous count: 12 kg"`
- One large centered quantity input — keyboard opens immediately on sheet open
- "Done" button at bottom

### Behavior
- Sheet opens with the item's previously entered quantity pre-filled (from the in-memory `inventoryInputs` state, same as current)
- Tapping Done closes the sheet and marks the item as counted in the list
- Tapping outside the sheet dismisses without saving; if the value differs from what it was when the sheet opened, shows a brief confirm prompt before discarding

---

## Bottom Sheet — Expiry Item

Opens when an expiry-tracked item row is tapped.

### Layout
- Drag handle at top
- Item name (bold) + category badge
- Previous count shown as soft reference
- Batch list — each batch is one row:
  - Quantity input (left half)
  - Expiry date button (right half) — shows formatted date or `"Set date"` placeholder
  - Expiry status line below the row (small colored text: e.g., `"● 5 days left"` or `"● EXPIRED"`)
  - Batch row background tinted: red if expired, amber if warning, clear if ok
  - Remove button (×) shown only when there is more than 1 batch
- `"+ Add another batch"` text link below the batch list
- Divider
- `"Total: X unit"` — auto-calculated from all batch quantities, shown prominently
- "Done" button at bottom

### Date Picker
- iOS: existing modal (slide-up) — no change
- Android: existing native date picker — no change

### Behavior
- Sheet opens with batches pre-populated from the last submitted inventory report (restored from `inventoryInputs` state — same logic as current code)
- If no previous report exists for the item, a single empty batch row is shown
- Total quantity auto-calculates as batch quantities are entered
- Done is blocked if any batch has a quantity but no date, or a date but no quantity — inline error shown on that batch row
- Empty batches (both quantity and date blank) are silently ignored
- Tapping outside the sheet dismisses without saving; if any batch differs from its state when the sheet opened, shows a brief confirm prompt before discarding

---

## Submit Flow

- Submit button label: `"Submit Report (X items)"`
- Tapping shows confirmation alert (same text as current) before submitting
- Duplicate report handling (replace prompt) unchanged
- Offline queue behavior unchanged

---

## Out of Scope

- No changes to `inventoryService.ts`, `submittedInventoryReportService.ts`, or any API layer
- No changes to the `LastSubmissionBanner` component
- No changes to the admin portal inventory pages
- No search or filter on the list (YAGNI — can be added later if needed)
- No step-by-step wizard or category tabs
