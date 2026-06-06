# Chart Subtitles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add static subtitle text below each chart/section heading in the store portal so every graph communicates what it measures at a glance.

**Architecture:** Pure JSX edits — add a `<p className="text-sm text-gray-500 mb-6">` after each `<h2>` (or flex-row title wrapper) in chart containers. For headings that have `mb-6`, reduce heading margin to `mb-1` so spacing moves to the subtitle. Headings inside flex rows get their wrapper reduced to `mb-2`; the subtitle sits below the wrapper with `mb-4`. The "Sales by Time of Day" section already has a dynamic peak-hour subtitle — leave it untouched.

**Tech Stack:** Next.js 15 App Router, React, Tailwind CSS

---

### Task 1: Add subtitles to charts with flex title rows in `reports/page.tsx`

The "Sales Trend" and "Payment Methods Distribution" charts both use a `<div className="flex items-center justify-between mb-6">` wrapper around the title + icon. The subtitle goes after that wrapper.

**Files:**
- Modify: `kioskly-admin/app/(main)/reports/page.tsx`

There are no unit tests for these presentational components. Verify visually by running the dev server after each task.

- [ ] **Step 1: Edit Sales Trend title block**

Find this block (around line 630):
```jsx
<div className="flex items-center justify-between mb-6">
  <h2 className="text-xl font-bold text-gray-900">Sales Trend</h2>
  <Calendar className="w-5 h-5 text-gray-400" />
</div>
```

Replace with:
```jsx
<div className="flex items-center justify-between mb-1">
  <h2 className="text-xl font-bold text-gray-900">Sales Trend</h2>
  <Calendar className="w-5 h-5 text-gray-400" />
</div>
<p className="text-sm text-gray-500 mb-4">Daily revenue totals over the selected period.</p>
```

- [ ] **Step 2: Edit Payment Methods Distribution title block**

Find this block (around line 667):
```jsx
<div className="flex items-center justify-between mb-6">
  <h2 className="text-xl font-bold text-gray-900">
    Payment Methods Distribution
  </h2>
  <TrendingUp className="w-5 h-5 text-gray-400" />
</div>
```

Replace with:
```jsx
<div className="flex items-center justify-between mb-1">
  <h2 className="text-xl font-bold text-gray-900">
    Payment Methods Distribution
  </h2>
  <TrendingUp className="w-5 h-5 text-gray-400" />
</div>
<p className="text-sm text-gray-500 mb-4">Share of transaction count by payment type.</p>
```

- [ ] **Step 3: Commit**

```bash
git add kioskly-admin/app/\(main\)/reports/page.tsx
git commit -m "feat(store): add subtitles to Sales Trend and Payment Methods charts"
```

---

### Task 2: Add subtitles to plain `<h2>` headings in `reports/page.tsx`

These sections have a bare `<h2 ... mb-6>`. Reduce heading margin to `mb-1` and add the subtitle with `mb-6`.

**Files:**
- Modify: `kioskly-admin/app/(main)/reports/page.tsx`

- [ ] **Step 1: Sales by Payment Method**

Find (around line 705):
```jsx
<h2 className="text-xl font-bold text-gray-900 mb-6">
  Sales by Payment Method
</h2>
```

Replace with:
```jsx
<h2 className="text-xl font-bold text-gray-900 mb-1">
  Sales by Payment Method
</h2>
<p className="text-sm text-gray-500 mb-6">Revenue and transaction count per payment channel. Click any card to filter transactions.</p>
```

- [ ] **Step 2: Top Selling Products**

Find (around line 796):
```jsx
<h2 className="text-xl font-bold text-gray-900 mb-6">
  Top Selling Products
</h2>
```

Replace with:
```jsx
<h2 className="text-xl font-bold text-gray-900 mb-1">
  Top Selling Products
</h2>
<p className="text-sm text-gray-500 mb-6">Ranked by revenue within the selected period.</p>
```

- [ ] **Step 3: Expenses section heading**

Find (around line 925):
```jsx
<h2 className="text-2xl font-bold text-gray-900 mb-6">Expenses</h2>
```

Replace with:
```jsx
<h2 className="text-2xl font-bold text-gray-900 mb-1">Expenses</h2>
<p className="text-sm text-gray-500 mb-6">Total outflows logged for the selected period.</p>
```

- [ ] **Step 4: Expense Breakdown by Category (`<h3>`)**

Find (around line 966):
```jsx
<h3 className="text-xl font-bold text-gray-900 mb-6">
  Expense Breakdown by Category
</h3>
```

Replace with:
```jsx
<h3 className="text-xl font-bold text-gray-900 mb-1">
  Expense Breakdown by Category
</h3>
<p className="text-sm text-gray-500 mb-6">Total spend distributed across expense categories.</p>
```

- [ ] **Step 5: Daily Sales & Quantity Overview**

Find (around line 1002):
```jsx
<h2 className="text-xl font-bold text-gray-900 mb-6">
  Daily Sales & Quantity Overview
</h2>
```

Replace with:
```jsx
<h2 className="text-xl font-bold text-gray-900 mb-1">
  Daily Sales & Quantity Overview
</h2>
<p className="text-sm text-gray-500 mb-6">Revenue bars show daily totals; the line tracks number of items sold.</p>
```

- [ ] **Step 6: Commit**

```bash
git add kioskly-admin/app/\(main\)/reports/page.tsx
git commit -m "feat(store): add subtitles to remaining report sections"
```

---

### Task 3: Add subtitle to Top Selling Products in `dashboard/page.tsx`

**Files:**
- Modify: `kioskly-admin/app/(main)/dashboard/page.tsx`

- [ ] **Step 1: Edit Top Selling Products heading**

Find (around line 366):
```jsx
<h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6">
  Top Selling Products
</h2>
```

Replace with:
```jsx
<h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
  Top Selling Products
</h2>
<p className="text-sm text-gray-500 mb-4 sm:mb-6">Ranked by revenue for the current month.</p>
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-admin/app/\(main\)/dashboard/page.tsx
git commit -m "feat(store): add subtitle to dashboard Top Selling Products"
```

---

### Task 4: Visual verification

- [ ] **Step 1: Start the store portal dev server**

```bash
npm run admin:dev
```

Expected: Next.js dev server starts on port 3000.

- [ ] **Step 2: Verify Reports page**

Open `http://localhost:3000/reports`. Confirm:
- "Sales Trend" → subtitle "Daily revenue totals over the selected period." appears below the title, above the chart
- "Payment Methods Distribution" → subtitle "Share of transaction count by payment type." appears
- "Sales by Payment Method" → subtitle "Revenue and transaction count per payment channel. Click any card to filter transactions." appears
- "Top Selling Products" → subtitle "Ranked by revenue within the selected period." appears
- "Expenses" → subtitle "Total outflows logged for the selected period." appears
- "Expense Breakdown by Category" → subtitle "Total spend distributed across expense categories." appears
- "Daily Sales & Quantity Overview" → subtitle "Revenue bars show daily totals; the line tracks number of items sold." appears
- "Sales by Time of Day" → dynamic "Peak hour: ..." line is unchanged

- [ ] **Step 3: Verify Dashboard page**

Open `http://localhost:3000/dashboard`. Confirm:
- "Top Selling Products" → subtitle "Ranked by revenue for the current month." appears below the heading, above the table
- All stat cards are unchanged
