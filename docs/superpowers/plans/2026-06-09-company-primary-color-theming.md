# Company Primary Color Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hardcoded orange color in the kioscify-company portal with the company's dynamic `primaryColor`, so each company sees its own brand color throughout the entire UI.

**Architecture:** Inject `--company-primary` and `--company-primary-light` as CSS custom properties on `document.documentElement` in `MainLayoutInner` (already has `primaryColor`), so all post-auth pages pick up theming via CSS variables without needing to import context. Pre-auth pages (login, change-password) derive their own `PRIMARY` from their own API calls since the layout wrapper is not active.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Tailwind CSS, NestJS (Prisma), inline `style` props, CSS custom properties.

---

## File Map

| File | Change |
|---|---|
| `kioskly-api/src/companies/companies.service.ts` | Add `themeColors: true` to `validateSubdomain` select |
| `kioscify-company/app/login/page.tsx` | Add `primaryColor` to `CompanyInfo`, pass to `LoginForm` |
| `kioscify-company/app/login/LoginForm.tsx` | Accept `primaryColor` prop, derive `PRIMARY` from it |
| `kioscify-company/app/change-password/page.tsx` | Derive `primaryColor` state from `api.getMyCompany()` |
| `kioscify-company/app/(main)/layout.tsx` | Inject `--company-primary` and `--company-primary-light` CSS vars |
| `kioscify-company/app/(main)/dashboard/page.tsx` | Replace orange Tailwind classes with CSS var inline styles |
| `kioscify-company/app/(main)/users/page.tsx` | Replace orange Tailwind classes with CSS var inline styles |
| `kioscify-company/app/(main)/brands/page.tsx` | Replace orange Tailwind classes with CSS var inline styles |
| `kioscify-company/app/(main)/analytics/components/OverviewCards.tsx` | Replace orange Tailwind classes with CSS var inline styles |
| `kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx` | Replace orange Tailwind classes with CSS var inline styles |
| `kioscify-company/app/(main)/brands/[brandId]/page.tsx` | Replace all orange Tailwind classes/hardcoded hex with CSS var inline styles |

---

## Task 1: Expose `themeColors` from `validateSubdomain` in the API

**Files:**
- Modify: `kioskly-api/src/companies/companies.service.ts:24-34`

The `validateSubdomain` method only selects `id, slug, name, logoUrl, isActive`. The login page needs `themeColors.primary` so it can brand the login screen before the user is authenticated.

- [ ] **Step 1: Add `themeColors` to the select clause**

In `companies.service.ts`, change the `select` block in `validateSubdomain` from:
```ts
select: { id: true, slug: true, name: true, logoUrl: true, isActive: true },
```
to:
```ts
select: { id: true, slug: true, name: true, logoUrl: true, isActive: true, themeColors: true },
```

Also add `themeColors` to the return object:
```ts
return {
  valid: !!company,
  companyId: company?.id ?? null,
  isActive: company?.isActive ?? false,
  name: company?.name ?? null,
  logoUrl: company?.logoUrl ?? null,
  themeColors: company?.themeColors ?? null,
};
```

- [ ] **Step 2: Verify the API still compiles**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioskly-api && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/src/companies/companies.service.ts
git commit -m "feat(api): expose themeColors in validateSubdomain response"
```

---

## Task 2: Thread `primaryColor` through login page

**Files:**
- Modify: `kioscify-company/app/login/page.tsx`
- Modify: `kioscify-company/app/login/LoginForm.tsx`

The server component `LoginPage` calls `validateSubdomain` and passes `company` to `LoginForm`. We need to extract `themeColors.primary` and pass it as `primaryColor` prop.

- [ ] **Step 1: Update `CompanyInfo` interface and `fetchCompanyInfo` in `page.tsx`**

Change `CompanyInfo` from:
```ts
interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  slug: string;
}
```
to:
```ts
interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  slug: string;
  primaryColor?: string;
}
```

Change the return line in `fetchCompanyInfo` from:
```ts
return { name: data.name, logoUrl: data.logoUrl, slug };
```
to:
```ts
return {
  name: data.name,
  logoUrl: data.logoUrl,
  slug,
  primaryColor: data.themeColors?.primary,
};
```

Also update the two `LoginForm` render calls to pass the prop:
```tsx
return <LoginForm companySlug={null} company={null} />;
```
stays as-is (no company yet).

```tsx
return <LoginForm companySlug={company ? companySlug : null} company={company} />;
```
stays as-is — `company` already includes `primaryColor` since we added it to the interface and `fetchCompanyInfo`.

- [ ] **Step 2: Update `LoginForm.tsx` to accept and use `primaryColor` prop**

Add `primaryColor?: string` to the props interface:
```ts
export default function LoginForm({
  companySlug,
  company,
  primaryColor,
}: {
  companySlug: string | null;
  company: CompanyInfo | null;
  primaryColor?: string;
}) {
```

Replace the hardcoded constant at the top of the component:
```ts
const PRIMARY = '#ea580c';
```
with:
```ts
const PRIMARY = primaryColor ?? company?.primaryColor ?? '#ea580c';
```

No other changes needed — all existing uses of `PRIMARY` in `LoginForm.tsx` already reference the constant via inline styles.

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add kioscify-company/app/login/page.tsx kioscify-company/app/login/LoginForm.tsx
git commit -m "feat(login): thread company primaryColor into login page branding"
```

---

## Task 3: Derive `primaryColor` dynamically in change-password page

**Files:**
- Modify: `kioscify-company/app/change-password/page.tsx`

This page already calls `api.getMyCompany()` and has `const PRIMARY = '#ea580c'` hardcoded. Since `api.getMyCompany()` returns the full `Company` object (which includes `themeColors`), we can derive the color from the response.

- [ ] **Step 1: Replace the hardcoded constant with state**

Remove this line:
```ts
const PRIMARY = '#ea580c';
```

Add state after the existing `useState` declarations (e.g., after `setLogoSrc`):
```ts
const [primaryColor, setPrimaryColor] = useState('#ea580c');
```

- [ ] **Step 2: Set `primaryColor` in the `api.getMyCompany()` callback**

In the `useEffect`, change:
```ts
api.getMyCompany()
  .then(company => {
    if (company.name) setCompanyName(company.name);
    setLogoSrc(resolveLogoUrl(company.logoUrl));
  })
  .catch(() => {});
```
to:
```ts
api.getMyCompany()
  .then(company => {
    if (company.name) setCompanyName(company.name);
    setLogoSrc(resolveLogoUrl(company.logoUrl));
    setPrimaryColor(company.themeColors?.primary ?? '#ea580c');
  })
  .catch(() => {});
```

- [ ] **Step 3: Update all references from `PRIMARY` to `primaryColor`**

There are four derived variables that reference `PRIMARY`. They are computed at render time, so since `primaryColor` is now state they will automatically re-derive on each render when `primaryColor` updates. Change:
```ts
const panelText = getContrastColor(PRIMARY);
const panelMuted = panelText === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
const panelPillBg = panelText === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';
const ringColor = panelText === '#ffffff' ? 'white' : '#111827';
```
to:
```ts
const panelText = getContrastColor(primaryColor);
const panelMuted = panelText === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
const panelPillBg = panelText === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';
const ringColor = panelText === '#ffffff' ? 'white' : '#111827';
```

Also update all JSX inline style references from `PRIMARY` to `primaryColor`. There are 5 occurrences in the JSX:

1. Left panel background: `style={{ backgroundColor: PRIMARY }}` → `style={{ backgroundColor: primaryColor }}`
2. Building2 icon in fallback logo (left panel): `style={{ color: PRIMARY }}` → `style={{ color: primaryColor }}`
3. Mobile brand header fallback div: `style={{ backgroundColor: PRIMARY }}` → `style={{ backgroundColor: primaryColor }}`
4. KeyRound icon: `style={{ color: PRIMARY }}` → `style={{ color: primaryColor }}`
5. Submit button: `style={{ backgroundColor: PRIMARY, color: getContrastColor(PRIMARY) }}` → `style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}`

And the ring color CSS custom property on all 3 inputs:
```ts
style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
```
→
```ts
style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add kioscify-company/app/change-password/page.tsx
git commit -m "feat(change-password): derive primaryColor dynamically from company API"
```

---

## Task 4: Inject CSS variables in the main layout

**Files:**
- Modify: `kioscify-company/app/(main)/layout.tsx`

`MainLayoutInner` already derives `primaryColor` from `useCompany()`. We inject it as `--company-primary` and `--company-primary-light` (10% opacity tint) on `document.documentElement` so all nested pages can use CSS variables without importing context.

- [ ] **Step 1: Add the CSS variable injection `useEffect`**

After the existing two `useEffect` blocks (the auth guard and the company logo/name effect), add:
```ts
useEffect(() => {
  document.documentElement.style.setProperty('--company-primary', primaryColor);
  document.documentElement.style.setProperty('--company-primary-light', `${primaryColor}18`);
}, [primaryColor]);
```

The `18` appended to the hex is 0x18 = 24 in decimal, giving ~9% opacity — a suitable tint for icon badge backgrounds.

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add kioscify-company/app/(main)/layout.tsx
git commit -m "feat(layout): inject --company-primary and --company-primary-light CSS variables"
```

---

## Task 5: Theme the dashboard page

**Files:**
- Modify: `kioscify-company/app/(main)/dashboard/page.tsx`

Replace 5 orange class occurrences with CSS variable inline styles.

- [ ] **Step 1: Fix the loading spinner**

Change:
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
```
to:
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
```

- [ ] **Step 2: Fix the Total Brands card icon badge**

Change:
```tsx
<div className="p-2 bg-orange-50 rounded-lg">
  <BookOpen className="w-4 h-4 text-orange-600" />
</div>
```
to:
```tsx
<div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--company-primary-light, #ea580c18)' }}>
  <BookOpen className="w-4 h-4" style={{ color: 'var(--company-primary, #ea580c)' }} />
</div>
```

- [ ] **Step 3: Fix the "View all" link**

Change:
```tsx
<a
  href="/brands"
  className="text-sm text-orange-600 hover:text-orange-800 flex items-center gap-1"
>
```
to:
```tsx
<a
  href="/brands"
  className="text-sm flex items-center gap-1"
  style={{ color: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 4: Fix the "Create your first brand" link**

Change:
```tsx
<a href="/brands" className="text-orange-600 hover:underline">
  Create your first brand
</a>
```
to:
```tsx
<a href="/brands" className="hover:underline" style={{ color: 'var(--company-primary, #ea580c)' }}>
  Create your first brand
</a>
```

- [ ] **Step 5: Fix the "Manage" link in brand rows**

Change:
```tsx
<a
  href={`/brands/${brand.id}`}
  className="text-sm text-orange-600 hover:text-orange-800 font-medium"
>
  Manage
</a>
```
to:
```tsx
<a
  href={`/brands/${brand.id}`}
  className="text-sm font-medium"
  style={{ color: 'var(--company-primary, #ea580c)' }}
>
  Manage
</a>
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add kioscify-company/app/(main)/dashboard/page.tsx
git commit -m "feat(dashboard): replace hardcoded orange with CSS variable theming"
```

---

## Task 6: Theme the users page

**Files:**
- Modify: `kioscify-company/app/(main)/users/page.tsx`

Replace the spinner, the "New User" button, all ring-color hex values, and the "Create User" submit button.

- [ ] **Step 1: Fix the loading spinner**

Change:
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
```
to:
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
```

- [ ] **Step 2: Fix the "New User" button**

Change:
```tsx
<button
  onClick={() => setShowForm(true)}
  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium transition-colors"
>
```
to:
```tsx
<button
  onClick={() => setShowForm(true)}
  className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:brightness-90 text-sm font-medium transition-colors"
  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 3: Fix all ring-color hardcoded hex strings in form inputs**

There are 4 inputs (First Name, Last Name, Email, Username) each with:
```ts
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```
Change all 4 to:
```ts
style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
```

- [ ] **Step 4: Fix the "Create User" submit button**

Change:
```tsx
<button type="submit" disabled={formLoading}
  className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
```
to:
```tsx
<button type="submit" disabled={formLoading}
  className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50"
  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add kioscify-company/app/(main)/users/page.tsx
git commit -m "feat(users): replace hardcoded orange with CSS variable theming"
```

---

## Task 7: Theme the brands list page

**Files:**
- Modify: `kioscify-company/app/(main)/brands/page.tsx`

- [ ] **Step 1: Fix the loading spinner**

Change:
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
```
to:
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
```

- [ ] **Step 2: Fix the "New Brand" button**

Change:
```tsx
<button
  onClick={() => setShowForm(true)}
  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium transition-colors"
>
```
to:
```tsx
<button
  onClick={() => setShowForm(true)}
  className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:brightness-90 text-sm font-medium transition-colors"
  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 3: Fix all ring-color hardcoded hex strings in the create form**

There are 3 inputs (Brand Name, Slug) and 1 textarea (Description) each with:
```ts
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```
Change all to:
```ts
style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
```

- [ ] **Step 4: Fix the "Create Brand" submit button**

Change:
```tsx
<button
  type="submit"
  disabled={formLoading}
  className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 transition-colors"
>
```
to:
```tsx
<button
  type="submit"
  disabled={formLoading}
  className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50 transition-colors"
  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 5: Fix the "Create your first brand" button**

Change:
```tsx
<button
  onClick={() => setShowForm(true)}
  className="mt-3 text-orange-600 hover:underline text-sm"
>
```
to:
```tsx
<button
  onClick={() => setShowForm(true)}
  className="mt-3 hover:underline text-sm"
  style={{ color: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 6: Fix the "Manage" link in brand rows**

Change:
```tsx
<a
  href={`/brands/${brand.id}`}
  className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-800 font-medium"
>
```
to:
```tsx
<a
  href={`/brands/${brand.id}`}
  className="flex items-center gap-1 text-sm font-medium"
  style={{ color: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 7: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add kioscify-company/app/(main)/brands/page.tsx
git commit -m "feat(brands): replace hardcoded orange with CSS variable theming"
```

---

## Task 8: Theme the analytics OverviewCards component

**Files:**
- Modify: `kioscify-company/app/(main)/analytics/components/OverviewCards.tsx`

All 3 cards share the same `bgClass: 'bg-orange-50'` and `iconClass: 'text-orange-600'` (or `text-orange-500`). We remove those fields from the cards array and apply CSS variable styles directly.

- [ ] **Step 1: Remove `bgClass` and `iconClass` from the cards array**

Change the `cards` array definition from:
```ts
const cards = [
  {
    label: 'Total Brands',
    subtitle: 'Brands operating under your company',
    value: data?.totalBrands ?? 0,
    icon: BookOpen,
    bgClass: 'bg-orange-50',
    iconClass: 'text-orange-600',
  },
  {
    label: 'Total Stores',
    subtitle: 'All stores across all brands',
    value: data?.totalStores ?? 0,
    icon: Store,
    bgClass: 'bg-orange-50',
    iconClass: 'text-orange-500',
  },
  {
    label: 'Active Stores',
    subtitle: 'Stores with at least one transaction in the selected period',
    value: data?.activeStores ?? 0,
    icon: Activity,
    bgClass: 'bg-orange-50',
    iconClass: 'text-orange-600',
  },
];
```
to:
```ts
const cards = [
  {
    label: 'Total Brands',
    subtitle: 'Brands operating under your company',
    value: data?.totalBrands ?? 0,
    icon: BookOpen,
  },
  {
    label: 'Total Stores',
    subtitle: 'All stores across all brands',
    value: data?.totalStores ?? 0,
    icon: Store,
  },
  {
    label: 'Active Stores',
    subtitle: 'Stores with at least one transaction in the selected period',
    value: data?.activeStores ?? 0,
    icon: Activity,
  },
];
```

- [ ] **Step 2: Update the card render to use CSS variable inline styles**

Change the card render from:
```tsx
{cards.map(({ label, subtitle, value, icon: Icon, bgClass, iconClass }) => (
  <div key={label} className="bg-white rounded-lg border p-5">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <div className={`p-2 ${bgClass} rounded-lg`}>
        <Icon className={`w-4 h-4 ${iconClass}`} />
      </div>
    </div>
```
to:
```tsx
{cards.map(({ label, subtitle, value, icon: Icon }) => (
  <div key={label} className="bg-white rounded-lg border p-5">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--company-primary-light, #ea580c18)' }}>
        <Icon className="w-4 h-4" style={{ color: 'var(--company-primary, #ea580c)' }} />
      </div>
    </div>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add kioscify-company/app/(main)/analytics/components/OverviewCards.tsx
git commit -m "feat(analytics): replace hardcoded orange in OverviewCards with CSS variable theming"
```

---

## Task 9: Theme the DateRangePicker component

**Files:**
- Modify: `kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx`

Two date inputs have hardcoded ring color and the "Apply" button has hardcoded orange background.

- [ ] **Step 1: Fix the custom date range inputs ring colors**

The two `<input type="date" ...>` elements each have:
```ts
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```
Change both to:
```ts
style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
```

- [ ] **Step 2: Fix the "Apply" button**

Change:
```tsx
<button
  type="button"
  onClick={handleCustomApply}
  className="text-sm bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors"
>
  Apply
</button>
```
to:
```tsx
<button
  type="button"
  onClick={handleCustomApply}
  className="text-sm text-white px-3 py-1.5 rounded-lg hover:brightness-90 transition-colors"
  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
>
  Apply
</button>
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx
git commit -m "feat(analytics): replace hardcoded orange in DateRangePicker with CSS variable theming"
```

---

## Task 10: Theme the brand detail page — part 1 (structural elements)

**Files:**
- Modify: `kioscify-company/app/(main)/brands/[brandId]/page.tsx` (lines 1–600)

This file is large (~2028 lines). We tackle it in two parts: this task covers structural elements (spinner, tab bar, tab section headers, store action icons, delivery modal button, settings logo upload button, settings save button).

- [ ] **Step 1: Fix all loading spinners (3 occurrences)**

Find and replace all three `border-orange-600` spinner instances:
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
```
→ (page-level loading at line ~506)
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
```

```tsx
<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600" />
```
→ (tab loading spinner at line ~558)
```tsx
<div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderBottomColor: 'var(--company-primary, #ea580c)' }} />
```

- [ ] **Step 2: Fix the active tab indicator in the tab bar**

Change:
```tsx
className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
  activeTab === tab.id
    ? 'border-orange-600 text-orange-600'
    : 'border-transparent text-gray-500 hover:text-gray-700'
}`}
```
to:
```tsx
className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
  activeTab === tab.id
    ? ''
    : 'border-transparent text-gray-500 hover:text-gray-700'
}`}
style={activeTab === tab.id ? {
  borderBottomColor: 'var(--company-primary, #ea580c)',
  color: 'var(--company-primary, #ea580c)',
} : undefined}
```

- [ ] **Step 3: Fix the edit hover icon color on `CRUDRow`, `CategoryRow`, `ReorderRow`, and `ProductRow` (hover:text-orange-600)**

These sub-components have pencil button hover states:
```tsx
className="p-1.5 text-gray-400 hover:text-orange-600 rounded"
```
Since these are hover states and we cannot easily do inline style for hover in React without CSS-in-JS, the cleanest approach is to leave these as-is — the `hover:text-orange-600` on edit icon hover is a secondary accent and does not affect the primary brand identity. The spec only lists primary CTAs and prominent text.

**Decision:** Leave `hover:text-orange-600` on the pencil row edit buttons unchanged — these are subtle row actions and the spec doesn't call them out.

- [ ] **Step 4: Fix the store action icon hover colors (Truck, QrCode, Copy)**

In the stores table, the action icons use `hover:text-orange-600`:
```tsx
className="text-gray-400 hover:text-orange-600 transition-colors"
```
(3 occurrences for Truck, QrCode, Copy buttons at lines ~792, ~803, ~813)

Leave these unchanged for the same reason as Step 3 — subtle hover states on gray icons.

- [ ] **Step 5: Fix the store "Save" inline edit link**

Change:
```tsx
<button onClick={() => handleSaveStoreName(store.id)} className="text-sm text-orange-600 hover:text-orange-800 font-medium">Save</button>
```
to:
```tsx
<button onClick={() => handleSaveStoreName(store.id)} className="text-sm font-medium" style={{ color: 'var(--company-primary, #ea580c)' }}>Save</button>
```

- [ ] **Step 6: Fix the delivery modal "Save" button**

Change:
```tsx
<button
  onClick={handleSaveDelivery}
  className="text-sm text-white bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg font-medium"
>
  Save
</button>
```
to:
```tsx
<button
  onClick={handleSaveDelivery}
  className="text-sm text-white px-4 py-2 rounded-lg font-medium hover:brightness-90"
  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
>
  Save
</button>
```

- [ ] **Step 7: Fix the logo upload button in Settings tab**

Change:
```tsx
<label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
  logoUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-orange-600 text-white hover:bg-orange-700'
}`}>
```
to:
```tsx
<label
  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
    logoUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'text-white hover:brightness-90'
  }`}
  style={logoUploading ? undefined : { backgroundColor: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 8: Fix the Brand Settings save button**

Change:
```tsx
<button
  type="submit"
  disabled={settingsSaving}
  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
>
```
to:
```tsx
<button
  type="submit"
  disabled={settingsSaving}
  className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:brightness-90 disabled:opacity-50 text-sm font-medium"
  style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 9: Fix the settings theme color inputs focus ring (line ~999)**

Change:
```tsx
className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-orange-500"
```
to:
```tsx
className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-md font-mono focus:outline-none focus:ring-1"
style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
```

- [ ] **Step 10: Fix the TabSection "Add" link**

In the `TabSection` component:
```tsx
<button
  onClick={onAdd}
  className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-800 font-medium"
>
```
to:
```tsx
<button
  onClick={onAdd}
  className="flex items-center gap-1.5 text-sm font-medium"
  style={{ color: 'var(--company-primary, #ea580c)' }}
>
```

- [ ] **Step 11: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 12: Commit**

```bash
git add kioscify-company/app/(main)/brands/[brandId]/page.tsx
git commit -m "feat(brand-detail): replace hardcoded orange structural elements with CSS variable theming"
```

---

## Task 11: Theme the brand detail page — part 2 (modal forms)

**Files:**
- Modify: `kioscify-company/app/(main)/brands/[brandId]/page.tsx` (modal components starting at line ~1262)

This covers all the CRUD modal forms at the bottom of the file: CategoryModal, ProductModal, SizeModal, AddonModal, PreferenceModal, InventoryModal. Each has inputs with `'#ea580c'` ring color and a submit button with `bg-orange-600`.

- [ ] **Step 1: Fix `CategoryModal` inputs and submit button**

Two inputs in `CategoryModal` (Name and Description) have:
```ts
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```
Change both to:
```ts
style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
```

Submit button in `CategoryModal`:
```tsx
<button type="submit" disabled={loading} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
```
→
```tsx
<button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
```

- [ ] **Step 2: Fix `ProductModal` inputs and submit button**

`ProductModal` has these inputs with `'#ea580c'` ring: Name (line ~1464), Price (line ~1471). Note FoodPanda price input uses `'#ec4899'` (pink) and Grab uses `'#22c55e'` (green) — these are intentional platform brand colors, leave them unchanged.

The `Upload Image` label button also has `bg-orange-600 text-white hover:bg-orange-700`:
```tsx
<label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer bg-orange-600 text-white hover:bg-orange-700 transition-colors">
```
→
```tsx
<label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer text-white hover:brightness-90 transition-colors" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
```

The checkbox rows for Sizes and Add-ons use `text-orange-600` on the checkbox: `className="rounded border-gray-300 text-orange-600"` — leave these unchanged, they're Tailwind's checkbox accent color and cannot be set via CSS variables without additional configuration.

Submit button in `ProductModal`:
```tsx
<button type="submit" disabled={loading} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
```
→
```tsx
<button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
```

- [ ] **Step 3: Fix `SizeModal` inputs and submit button**

`SizeModal` Name and Price Modifier inputs have `'#ea580c'` ring — change both to `'var(--company-primary, #ea580c)'`. FoodPanda/Grab price inputs use pink/green — leave unchanged.

Submit button:
```tsx
<button type="submit" disabled={loading} className="flex-1 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50">
```
→
```tsx
<button type="submit" disabled={loading} className="flex-1 py-2 text-white rounded-lg text-sm font-medium hover:brightness-90 disabled:opacity-50" style={{ backgroundColor: 'var(--company-primary, #ea580c)' }}>
```

- [ ] **Step 4: Fix `AddonModal` inputs and submit button**

`AddonModal` Name and Price inputs have `'#ea580c'` ring — change both to `'var(--company-primary, #ea580c)'`. FoodPanda/Grab leave unchanged.

Submit button: same pattern as Step 3.

- [ ] **Step 5: Fix `PreferenceModal` input and submit button**

`PreferenceModal` Label input has `'#ea580c'` ring — change to `'var(--company-primary, #ea580c)'`.

Submit button: same pattern as Step 3.

- [ ] **Step 6: Fix `InventoryModal` inputs and submit button**

`InventoryModal` has 4 inputs with `'#ea580c'` ring (Name, Unit, Min Stock Level, Expiry Warning Days) — change all 4 to `'var(--company-primary, #ea580c)'`.

The checkbox `text-orange-600 focus:ring-orange-500` on the "Track expiration dates" checkbox — leave unchanged (Tailwind checkbox accent).

Submit button: same pattern as Step 3.

- [ ] **Step 7: Fix the store name inline edit input ring color**

In the stores table, when `editingStoreId === store.id`, there's an input:
```ts
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```
Change to:
```ts
style={{ '--tw-ring-color': 'var(--company-primary, #ea580c)' } as React.CSSProperties}
```

- [ ] **Step 8: Fix the Brand Settings form inputs ring colors**

In the Settings tab, `settingsName` textarea and `settingsPreferenceLabel` input (and `settingsDescription` textarea) all have `'#ea580c'` ring — change all to `'var(--company-primary, #ea580c)'`.

- [ ] **Step 9: Verify TypeScript**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add kioscify-company/app/(main)/brands/[brandId]/page.tsx
git commit -m "feat(brand-detail): replace hardcoded orange in modal forms with CSS variable theming"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full TypeScript check across the company portal**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company && npx tsc --noEmit 2>&1
```
Expected: No errors.

- [ ] **Step 2: Grep for remaining hardcoded orange in source files (excluding node_modules and .next)**

```bash
grep -rn "bg-orange-\|text-orange-\|border-orange-\|#ea580c\|orange-500\|orange-600\|orange-700\|orange-800" \
  /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company/app \
  /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioscify-company/components \
  --include="*.tsx" --include="*.ts"
```

Review each remaining hit:
- `text-orange-600` on checkbox `className` in ProductModal, SizeModal, AddonModal, InventoryModal → intentional (Tailwind checkbox accent color, cannot be CSS-variabled without custom config)
- `hover:text-orange-600` on pencil icon row buttons in CRUDRow, CategoryRow, ReorderRow, ProductRow → intentional (secondary hover, spec exempts these)
- `focus:ring-orange-500` on inventory checkbox → intentional
- Anything in `components/StoreQRModal.tsx` or other components not in scope → note for future

Any remaining `#ea580c` NOT in a `primaryColor ?? '#ea580c'` fallback pattern should be investigated and fixed.

- [ ] **Step 3: Commit if any cleanup fixes were made**

```bash
git add -p
git commit -m "fix(theming): clean up any remaining hardcoded orange instances"
```
(Only if there were actual fixes — skip if clean.)
