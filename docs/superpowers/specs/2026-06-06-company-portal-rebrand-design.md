# Company Portal UI Rebrand Design

**Date:** 2026-06-06  
**Package:** `kioscify-company`  
**Status:** Approved

---

## Context

The company portal (`kioscify-company`) currently uses a generic indigo color scheme that is inconsistent with the Kioscify brand. The store portal (`kioskly-admin`) has an established, polished design language — Kioscify orange (`#ea580c`) primary, split-screen login, `rounded-xl` inputs — that the company portal must match. This rebrand makes both portals visually consistent and properly on-brand.

---

## Scope

All pages in `kioscify-company`:
- `app/login/LoginForm.tsx` — full redesign
- `app/change-password/page.tsx` — color + input update
- `app/(main)/layout.tsx` — sidebar color update
- `app/(main)/dashboard/page.tsx`
- `app/(main)/brands/page.tsx`
- `app/(main)/brands/[brandId]/page.tsx` (largest file — many inputs and indigo references)
- `app/(main)/users/page.tsx`
- `app/(main)/settings/page.tsx`
- `app/(main)/analytics/page.tsx` and its component files

---

## Design

### 1. Foundation Layer

**`tailwind.config.ts`** — extend theme with Kioscify tokens (matching store portal):
```ts
theme: {
  extend: {
    colors: {
      primary:   { DEFAULT: '#ea580c' },
      secondary: { DEFAULT: '#fb923c' },
      accent:    { DEFAULT: '#fdba74' },
    },
  },
},
```

> **Note on token usage:** Interior page replacements use Tailwind's built-in `orange-*` classes (e.g., `bg-orange-600`, `text-orange-600`) rather than `bg-primary` because Tailwind's orange-600 (`#ea580c`) is an exact match and avoids safelisting concerns. The `primary` token in tailwind.config is added for consistency with the store portal and for future use in dynamic style attributes.

**`lib/utils.ts`** — add two utilities (copy from `kioskly-admin/lib/utils.ts`):

- `getContrastColor(hex: string): string` — returns `#ffffff` or `#111827` based on luminance. Used for button text and panel text color on colored backgrounds.
- `resolveLogoUrl(logoUrl: string | null | undefined): string | null` — handles relative vs absolute URL resolution for logos.

**`app/globals.css`** — add base input color fix:
```css
input, textarea, select {
  color: #111827;
}
```

---

### 2. Login Page Redesign (`app/login/LoginForm.tsx`)

Replace centered card with the store portal's split-screen pattern.

**Left panel** (`hidden lg:flex lg:w-5/12 xl:w-1/2`, orange background):
- Same decorative opacity rings as store portal (using `ringColor = getContrastColor(primaryColor)`)
- Company logo if available: `w-28 h-28 rounded-2xl bg-white p-3 shadow-lg object-contain`
- Fallback: white `rounded-2xl` box with `Building2` icon in orange
- `h1 text-3xl font-bold drop-shadow` — company name (or "Company Portal")
- Subtitle: "Manage your brands, stores, and company — all in one place."
- Feature pills: `["Brands", "Stores", "Analytics", "Users"]` — same semi-transparent pill style as store portal

**Right panel** (flex-1, white):
- Mobile-only header: company logo/icon + name
- `h2 text-2xl font-bold text-gray-900` — "Sign in"
- Subtitle: "Sign in to your company account"
- Inputs: `w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white` with `style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}`
- Optional Company Slug input (when no subdomain) — same input style
- Submit button: `w-full font-semibold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:brightness-90 mt-2` with `style={{ backgroundColor: '#ea580c', color: getContrastColor('#ea580c') }}`
- Error banner: `rounded-xl` (upgrade from `rounded`)
- "Powered by Kioscify" pill badge: `flex items-center gap-2 mt-10 bg-white border border-gray-200 rounded-full px-3 py-1.5 w-fit mx-auto`

The `CompanyInfo` interface already has `name` and `logoUrl` — no backend changes needed.

---

### 3. Sidebar (`app/(main)/layout.tsx`)

| Element | Current | New |
|---|---|---|
| Active nav item | `bg-indigo-50 text-indigo-700 font-medium` | `bg-orange-50 text-orange-700 font-medium` |
| Loading spinner | `border-b-2 border-indigo-600` | `border-b-2 border-orange-600` |

No structural changes — only color class swaps.

---

### 4. Interior Pages — Systematic Color Replacements

Apply to: `dashboard/page.tsx`, `brands/page.tsx`, `brands/[brandId]/page.tsx`, `users/page.tsx`, `settings/page.tsx`, `change-password/page.tsx`, `analytics/page.tsx`, and all analytics sub-components.

**Color class replacements:**

| From | To |
|---|---|
| `bg-indigo-600` | `bg-orange-600` |
| `hover:bg-indigo-700` | `hover:bg-orange-700` |
| `bg-indigo-50` | `bg-orange-50` |
| `text-indigo-600` | `text-orange-600` |
| `text-indigo-700` | `text-orange-700` |
| `hover:text-indigo-600` | `hover:text-orange-600` |
| `hover:text-indigo-800` | `hover:text-orange-800` |
| `focus:ring-indigo-500` | `focus:ring-orange-500` |
| `border-indigo-600` | `border-orange-600` |

**Input/textarea/select element upgrades** (in all form elements):

| Property | From | To |
|---|---|---|
| Border radius | `rounded-md` | `rounded-xl` |
| Padding | `px-3 py-2` | `px-4 py-3` |
| Border color | `border-gray-300` | `border-gray-200` |
| Focus | `focus:outline-none focus:ring-2 focus:ring-indigo-500` | `outline-none transition focus:ring-2 focus:border-transparent` + `style={{ '--tw-ring-color': '#ea580c' }}` |

**Do NOT change:** analytics chart accent colors (blue/green/purple for card icons) — these are intentional visual variety for data differentiation.

---

### 5. Change Password Page (`app/change-password/page.tsx`)

Same color + input upgrades as interior pages. The page layout (centered card on gray background) can remain as-is — it's a one-time screen, not part of the main portal experience.

---

## Verification

1. Run `npm run company:dev` (port 3001)
2. Navigate to the login page — confirm split-screen layout with orange left panel, company logo/name shown, inputs are `rounded-xl`, button is orange
3. Log in and check the sidebar — active item should be orange, not indigo
4. Visit each page: Dashboard, Brands, Analytics, Users, Settings
5. Open a modal (e.g., "New Brand") — confirm inputs inside modals are also upgraded
6. Check mobile: sidebar overlay, mobile login header
7. Verify no indigo classes remain: `grep -r "indigo" kioscify-company/app --include="*.tsx"`
