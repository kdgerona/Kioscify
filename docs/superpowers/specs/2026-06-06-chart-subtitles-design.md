# Chart Subtitles — Design Spec

**Date:** 2026-06-06
**Status:** Approved

## Goal

Add static subtitle text below each chart/section heading in the store portal so that every graph and analytics section communicates what it measures at a glance, without requiring the user to interpret the chart title alone.

## Scope

Two files in `kioskly-admin`:
- `app/(main)/reports/page.tsx`
- `app/(main)/dashboard/page.tsx`

## Approach

Add a `<p className="text-sm text-gray-500 mb-6">` immediately after each `<h2>` heading inside chart/section containers. No new components — inline paragraph elements only.

The "Sales by Time of Day" section already has a dynamic peak-hour subtitle; it keeps that and receives no additional static description.

## Subtitle Copy

### `reports/page.tsx`

| Section heading | Subtitle |
|---|---|
| Sales Trend | Daily revenue totals over the selected period. |
| Payment Methods Distribution | Share of transaction count by payment type. |
| Sales by Payment Method | Revenue and transaction count per payment channel. Click any card to filter transactions. |
| Top Selling Products | Ranked by revenue within the selected period. |
| Expenses (section h2) | Total outflows logged for the selected period. |
| Expense Breakdown by Category | Total spend distributed across expense categories. |
| Daily Sales & Quantity Overview | Revenue bars show daily totals; the line tracks number of items sold. |
| Sales by Time of Day | *(keep existing dynamic "Peak hour" line — no static description added)* |

### `dashboard/page.tsx`

| Section heading | Subtitle |
|---|---|
| Top Selling Products | Ranked by revenue for the current month. |

Dashboard stat cards already carry supporting text and do not need subtitles.

## Implementation Notes

- All subtitles use `text-sm text-gray-500` to sit clearly below the bold heading without competing with it.
- `mb-6` on the subtitle replaces the `mb-6` currently on the heading where the chart body follows.
- No API changes, no new state, no new components.
