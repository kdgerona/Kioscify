# Company Portal UI Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic indigo color scheme in `kioscify-company` with the Kioscify orange palette and redesign the login page to match the store portal's split-screen pattern.

**Architecture:** Foundation layer first (Tailwind tokens, utilities, globals), then login redesign, then systematic color + input upgrades across all 9 remaining files. No test framework exists in this Next.js project — verification is visual via the dev server.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS 3.4, Lucide React, TypeScript

**Reference portal:** `kioskly-admin` at `../kioskly-admin` — the store portal whose design we are matching.

---

## File Map

| File | Change type |
|---|---|
| `kioscify-company/tailwind.config.ts` | Add Kioscify color tokens |
| `kioscify-company/lib/utils.ts` | Add `getContrastColor`, `resolveLogoUrl` |
| `kioscify-company/app/globals.css` | Add input base color fix |
| `kioscify-company/app/login/LoginForm.tsx` | Full rewrite — split-screen layout |
| `kioscify-company/app/change-password/page.tsx` | Input + button color upgrade |
| `kioscify-company/app/(main)/layout.tsx` | Sidebar active color + spinner |
| `kioscify-company/app/(main)/dashboard/page.tsx` | Color class replacements |
| `kioscify-company/app/(main)/brands/page.tsx` | Color + input upgrade |
| `kioscify-company/app/(main)/brands/[brandId]/page.tsx` | Color + input upgrade (1712 lines) |
| `kioscify-company/app/(main)/users/page.tsx` | Color + input upgrade |
| `kioscify-company/app/(main)/settings/page.tsx` | Color + input upgrade |
| `kioscify-company/app/(main)/analytics/page.tsx` | Color class replacements |
| `kioscify-company/app/(main)/analytics/components/OverviewCards.tsx` | Color class replacements |
| `kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx` | Color + input upgrade |

---

## Task 1: Foundation — Tailwind config, utils, globals

**Files:**
- Modify: `kioscify-company/tailwind.config.ts`
- Modify: `kioscify-company/lib/utils.ts`
- Modify: `kioscify-company/app/globals.css`

- [ ] **Step 1: Extend Tailwind config with Kioscify color tokens**

Replace the entire content of `kioscify-company/tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: "#ea580c" },
        secondary: { DEFAULT: "#fb923c" },
        accent:    { DEFAULT: "#fdba74" },
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: Add `getContrastColor` and `resolveLogoUrl` to utils**

Append to `kioscify-company/lib/utils.ts` (after the existing exports):

```ts
export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#111827' : '#ffffff';
}

export function resolveLogoUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('http')) return logoUrl;
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';
  return `${apiBase}${logoUrl}`;
}
```

- [ ] **Step 3: Add input base color to globals.css**

Open `kioscify-company/app/globals.css` and add after the existing Tailwind directives:

```css
input, textarea, select {
  color: #111827;
}
```

- [ ] **Step 4: Commit**

```bash
git add kioscify-company/tailwind.config.ts kioscify-company/lib/utils.ts kioscify-company/app/globals.css
git commit -m "feat(company): add Kioscify color tokens, contrast util, and input base style"
```

---

## Task 2: Login page — full split-screen redesign

**Files:**
- Modify: `kioscify-company/app/login/LoginForm.tsx`

This is a full replacement of the existing centered-card login with the store portal's split-screen pattern (orange left panel + white right form).

- [ ] **Step 1: Replace the entire file**

Write this as the new `kioscify-company/app/login/LoginForm.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getContrastColor, resolveLogoUrl } from '@/lib/utils';

const PRIMARY = '#ea580c';

interface CompanyInfo {
  name: string;
  logoUrl: string | null;
  slug: string;
}

export default function LoginForm({
  companySlug,
  company,
}: {
  companySlug: string | null;
  company: CompanyInfo | null;
}) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (api.getToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const resolvedSlug = companySlug || slugInput;
      const data = await api.login({ username, password, companySlug: resolvedSlug });
      if (data.mustChangePassword || data.user?.isFirstLogin || data.user?.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const logoSrc = resolveLogoUrl(company?.logoUrl);
  const panelText  = getContrastColor(PRIMARY);
  const panelMuted = panelText === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)';
  const panelPillBg = panelText === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';
  const ringColor  = panelText === '#ffffff' ? 'white' : '#111827';

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand identity */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden"
        style={{ backgroundColor: PRIMARY }}
      >
        {/* Decorative rings */}
        <div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full border-[40px] opacity-10"
          style={{ borderColor: ringColor }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full border-[50px] opacity-10"
          style={{ borderColor: ringColor }}
        />
        <div
          className="absolute top-1/2 -right-16 w-64 h-64 rounded-full border-[30px] opacity-[0.07]"
          style={{ borderColor: ringColor }}
        />
        <div
          className="absolute bottom-24 left-8 w-32 h-32 rounded-full opacity-10"
          style={{ backgroundColor: ringColor }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={company!.name}
              className="w-28 h-28 object-contain rounded-2xl mb-6 shadow-lg bg-white p-3"
            />
          ) : (
            <div className="w-28 h-28 rounded-2xl flex items-center justify-center mb-6 shadow-lg bg-white">
              <Building2 className="w-14 h-14" style={{ color: PRIMARY }} />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-2 drop-shadow" style={{ color: panelText }}>
            {company?.name ?? 'Company Portal'}
          </h1>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: panelMuted }}>
            Manage your brands, stores, and company — all in one place.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Brands', 'Stores', 'Analytics', 'Users'].map(f => (
              <span
                key={f}
                className="text-xs font-medium px-3 py-1 rounded-full"
                style={{ background: panelPillBg, color: panelText }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-white">
        {/* Mobile-only brand header */}
        <div className="lg:hidden flex flex-col items-center mb-8">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt={company!.name}
              className="w-16 h-16 object-contain rounded-xl mb-3"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center mb-3"
              style={{ backgroundColor: PRIMARY }}
            >
              <Building2 className="w-8 h-8 text-white" />
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">
            {company?.name ?? 'Company Portal'}
          </h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your company account</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {!companySlug && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Company Slug
                </label>
                <input
                  type="text"
                  value={slugInput}
                  onChange={e => setSlugInput(e.target.value)}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
                  placeholder="e.g. your-company"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:brightness-90 mt-2"
              style={{ backgroundColor: PRIMARY, color: getContrastColor(PRIMARY) }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="flex items-center justify-center gap-2 mt-10 bg-white border border-gray-200 rounded-full px-3 py-1.5 w-fit mx-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.png" alt="Kioscify" className="w-5 h-5 object-contain" />
            <p className="text-xs text-gray-400">
              Powered by <span className="font-semibold text-gray-500">Kioscify</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the login page renders**

```bash
cd kioscify-company && npm run dev
```

Open http://localhost:3001/login. You should see:
- Orange left panel on desktop with decorative rings, Building2 icon (or company logo if available), "Company Portal" heading, feature pills
- White right panel with "Sign in" heading, `rounded-xl` inputs, orange submit button
- On mobile (narrow window): no left panel, just logo + form centered

- [ ] **Step 3: Commit**

```bash
git add kioscify-company/app/login/LoginForm.tsx
git commit -m "feat(company): redesign login page with Kioscify orange split-screen layout"
```

---

## Task 3: Change password page

**Files:**
- Modify: `kioscify-company/app/change-password/page.tsx`

- [ ] **Step 1: Update input and button classes**

In `kioscify-company/app/change-password/page.tsx`, apply these replacements:

Replace all three input fields (Current, New, Confirm password). Each currently has:
```
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
```
Replace with:
```
className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```

Replace the submit button class:
```
className="w-full py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors"
```
With:
```
className="w-full py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 disabled:opacity-50 text-sm font-semibold transition-colors"
```

Also update the error banner from `rounded` to `rounded-xl`:
```
className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm"
```
To:
```
className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
```

- [ ] **Step 2: Add `React` import if style prop is used**

The file already imports from React via useState/useEffect. The `as React.CSSProperties` cast requires `React` to be in scope. Since it's a `'use client'` Next.js file using React hooks, React is already available — no additional import needed.

- [ ] **Step 3: Commit**

```bash
git add "kioscify-company/app/change-password/page.tsx"
git commit -m "feat(company): update change-password page to Kioscify orange theme"
```

---

## Task 4: Main layout — sidebar

**Files:**
- Modify: `kioscify-company/app/(main)/layout.tsx`

- [ ] **Step 1: Update active nav item color**

In `kioscify-company/app/(main)/layout.tsx`, find the nav item active class:
```
'bg-indigo-50 text-indigo-700 font-medium'
```
Replace with:
```
'bg-orange-50 text-orange-700 font-medium'
```

- [ ] **Step 2: Update loading spinner color**

Find:
```
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
```
Replace with:
```
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto" />
```

- [ ] **Step 3: Commit**

```bash
git add "kioscify-company/app/(main)/layout.tsx"
git commit -m "feat(company): update sidebar active state and spinner to Kioscify orange"
```

---

## Task 5: Dashboard page

**Files:**
- Modify: `kioscify-company/app/(main)/dashboard/page.tsx`

- [ ] **Step 1: Replace indigo color classes**

In `kioscify-company/app/(main)/dashboard/page.tsx`, make these replacements:

```
border-b-2 border-indigo-600  →  border-b-2 border-orange-600
bg-indigo-50                  →  bg-orange-50
text-indigo-600               →  text-orange-600
hover:text-indigo-800         →  hover:text-orange-800
```

Specific locations:
- Loading spinner: `border-b-2 border-indigo-600`
- Total Brands KPI card icon: `bg-indigo-50` background + `text-indigo-600` icon
- "View all" link: `text-indigo-600 hover:text-indigo-800`
- "Create your first brand" empty state link: `text-indigo-600`
- "Manage" link on each brand row: `text-indigo-600 hover:text-indigo-800`

- [ ] **Step 2: Commit**

```bash
git add "kioscify-company/app/(main)/dashboard/page.tsx"
git commit -m "feat(company): update dashboard page to Kioscify orange theme"
```

---

## Task 6: Brands list page

**Files:**
- Modify: `kioscify-company/app/(main)/brands/page.tsx`

- [ ] **Step 1: Replace color classes and upgrade inputs**

In `kioscify-company/app/(main)/brands/page.tsx`:

**Color replacements:**
```
bg-indigo-600       →  bg-orange-600
hover:bg-indigo-700 →  hover:bg-orange-700
text-indigo-600     →  text-orange-600
hover:text-indigo-800 → hover:text-orange-800
border-b-2 border-indigo-600 → border-b-2 border-orange-600
```

**Input upgrades** — replace the three form inputs in the create brand modal. Each currently has:
```
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
```
Replace with:
```
className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```

The textarea in the form (description):
```
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
```
Replace with:
```
className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white resize-none"
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```

**Modal form error banner** (`rounded` → `rounded-xl`):
```
className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm"
```
Replace with:
```
className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
```

- [ ] **Step 2: Commit**

```bash
git add "kioscify-company/app/(main)/brands/page.tsx"
git commit -m "feat(company): update brands list page to Kioscify orange theme"
```

---

## Task 7: Brand detail page (largest file)

**Files:**
- Modify: `kioscify-company/app/(main)/brands/[brandId]/page.tsx`

This file is 1712 lines. Use targeted sed substitutions for the bulk replacements, then handle the special cases manually.

- [ ] **Step 1: Bulk color replacements via sed**

Run from the repo root (these are safe — each substitution is specific):

```bash
FILE="kioscify-company/app/(main)/brands/[brandId]/page.tsx"

# Simple class-level replacements
sed -i '' \
  -e 's/hover:text-indigo-600/hover:text-orange-600/g' \
  -e 's/border-indigo-600 text-indigo-600/border-orange-600 text-orange-600/g' \
  -e 's/border-b-2 border-indigo-600/border-b-2 border-orange-600/g' \
  -e 's/text-indigo-600 hover:text-indigo-800/text-orange-600 hover:text-orange-800/g' \
  -e 's/bg-indigo-600 text-white hover:bg-indigo-700/bg-orange-600 text-white hover:bg-orange-700/g' \
  -e 's/bg-indigo-600 text-white/bg-orange-600 text-white/g' \
  -e 's/hover:bg-indigo-700/hover:bg-orange-700/g' \
  -e 's/text-indigo-600/text-orange-600/g' \
  "$FILE"
```

- [ ] **Step 2: Upgrade input and textarea classes**

All inputs/textareas in this file currently use:
```
px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm
```
There are ~15 occurrences. Run:

```bash
FILE="kioscify-company/app/(main)/brands/[brandId]/page.tsx"
sed -i '' \
  -e 's/px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm/px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white/g' \
  "$FILE"
```

For any remaining `focus:ring-indigo-500` occurrences (e.g., the small hex color input on line ~825 which uses different sizing):

```bash
sed -i '' -e 's/focus:ring-1 focus:ring-indigo-500/focus:ring-1 focus:ring-orange-500/g' "$FILE"
```

- [ ] **Step 3: Fix checkbox accent color**

Two checkboxes use `text-indigo-600` for the checked accent color. After Step 1 they will already be `text-orange-600` — this is correct. Tailwind's `text-{color}` on a `<input type="checkbox">` sets `accent-color`. No additional change needed.

- [ ] **Step 4: Add `style` prop for focus ring color to critical inputs**

The sed replacement removed `focus:ring-indigo-500` and replaced the class, but the orange ring color is driven by `--tw-ring-color`. After the sed, find each `<input` and `<textarea` that had `focus:ring-2 focus:border-transparent` added and ensure the `style` prop is present.

Open the file and search for `focus:ring-2 focus:border-transparent` — each occurrence should have a nearby `style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}` prop. Add it to any element missing it.

The store name inline edit input (line ~679, now updated) should look like:
```tsx
<input
  type="text"
  value={editingStoreName}
  onChange={e => setEditingStoreName(e.target.value)}
  className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white w-full max-w-xs"
  style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
  autoFocus
/>
```

- [ ] **Step 5: Fix the tab active indicator**

The tab bar uses dynamic classes for the active tab (around line ~479):
```
'border-indigo-600 text-indigo-600'
```
After Step 1 this will be `border-orange-600 text-orange-600`. Verify it looks correct — it should already be changed by the sed.

- [ ] **Step 6: Verify no indigo remains**

```bash
grep -n "indigo" "kioscify-company/app/(main)/brands/[brandId]/page.tsx"
```

Expected output: empty (no matches).

- [ ] **Step 7: Commit**

```bash
git add "kioscify-company/app/(main)/brands/[brandId]/page.tsx"
git commit -m "feat(company): update brand detail page to Kioscify orange theme"
```

---

## Task 8: Users page

**Files:**
- Modify: `kioscify-company/app/(main)/users/page.tsx`

- [ ] **Step 1: Replace color classes and upgrade inputs**

In `kioscify-company/app/(main)/users/page.tsx`:

**Color replacements:**
```
bg-indigo-600       →  bg-orange-600
hover:bg-indigo-700 →  hover:bg-orange-700
border-b-2 border-indigo-600 → border-b-2 border-orange-600
```

**Input upgrades** — four inputs in the create user modal (First Name, Last Name, Email, Username). Each currently has:
```
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
```
Replace each with:
```
className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```

**Modal error banner:**
```
className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm"
```
Replace with:
```
className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm"
```

- [ ] **Step 2: Commit**

```bash
git add "kioscify-company/app/(main)/users/page.tsx"
git commit -m "feat(company): update users page to Kioscify orange theme"
```

---

## Task 9: Settings page

**Files:**
- Modify: `kioscify-company/app/(main)/settings/page.tsx`

- [ ] **Step 1: Replace color classes and upgrade inputs**

In `kioscify-company/app/(main)/settings/page.tsx`:

**Color replacements:**
```
border-b-2 border-indigo-600 → border-b-2 border-orange-600
bg-indigo-600       →  bg-orange-600
hover:bg-indigo-700 →  hover:bg-orange-700
```

**Input upgrades** — five inputs total: Company Name, Contact Email, Description (textarea), and three password change inputs (Current, New, Confirm). Each currently has:
```
className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
```
Replace each with:
```
className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```

The Description textarea also gets `resize-none` preserved:
```
className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white resize-none"
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```

The Change Password inline form submit button:
```
className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
```
Replace with:
```
className="flex-1 py-3 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
```

The Save Changes button:
```
className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors"
```
Replace with:
```
className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium transition-colors"
```

- [ ] **Step 2: Commit**

```bash
git add "kioscify-company/app/(main)/settings/page.tsx"
git commit -m "feat(company): update settings page to Kioscify orange theme"
```

---

## Task 10: Analytics page and components

**Files:**
- Modify: `kioscify-company/app/(main)/analytics/components/OverviewCards.tsx`
- Modify: `kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx`
- Check: `kioscify-company/app/(main)/analytics/page.tsx` (may have no indigo)

- [ ] **Step 1: Fix OverviewCards — Revenue card indigo**

In `kioscify-company/app/(main)/analytics/components/OverviewCards.tsx`, find the Revenue card config (around line 34):
```ts
bgClass: 'bg-indigo-50',
iconClass: 'text-indigo-600',
```
Replace with:
```ts
bgClass: 'bg-orange-50',
iconClass: 'text-orange-600',
```

- [ ] **Step 2: Fix DateRangePicker inputs and Apply button**

In `kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx`:

The two date inputs (around line 131, 138) currently have:
```
className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
```
Replace each with:
```
className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none transition focus:ring-2 focus:border-transparent"
style={{ '--tw-ring-color': '#ea580c' } as React.CSSProperties}
```
(Note: using `rounded-lg` here, not `rounded-xl`, because date picker controls are compact UI elements — `rounded-xl` would look too round at small sizes.)

The Apply button (around line 143):
```
className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
```
Replace with:
```
className="text-sm bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 transition-colors"
```

- [ ] **Step 3: Check analytics page**

```bash
grep -n "indigo" kioscify-company/app/\(main\)/analytics/page.tsx
```

If no output: nothing to do. If there are matches, apply the same color replacements (`indigo-*` → `orange-*`).

- [ ] **Step 4: Commit**

```bash
git add "kioscify-company/app/(main)/analytics/components/OverviewCards.tsx"
git add "kioscify-company/app/(main)/analytics/components/DateRangePicker.tsx"
git add "kioscify-company/app/(main)/analytics/page.tsx"
git commit -m "feat(company): update analytics components to Kioscify orange theme"
```

---

## Task 11: Final verification

- [ ] **Step 1: Confirm zero indigo references remain**

```bash
grep -r "indigo" kioscify-company/app --include="*.tsx" --include="*.ts"
```

Expected: no output. If any matches, fix them now.

- [ ] **Step 2: Run the dev server**

```bash
npm run company:dev
```

Open http://localhost:3001 and verify each page:

| Page | What to check |
|---|---|
| `/login` | Split-screen, orange left panel, company logo/icon, `rounded-xl` inputs, orange button |
| `/dashboard` | Orange KPI card icon (Brands), orange links |
| `/brands` | Orange "New Brand" button, orange "Manage" links, `rounded-xl` inputs in modal |
| `/brands/<id>` | Orange tab indicator, orange buttons, `rounded-xl` inputs, orange edit icons |
| `/users` | Orange "New User" button, `rounded-xl` inputs in modal |
| `/settings` | Orange "Save Changes" button, `rounded-xl` inputs, orange "Update Password" button |
| `/analytics` | Orange Revenue card icon, orange DateRangePicker Apply button |
| Sidebar | Orange active nav item (not indigo), orange loading spinner |
| Mobile | Narrow window: login shows no left panel, mobile header with icon + name |

- [ ] **Step 3: Final commit (if any fixes were needed)**

```bash
git add -u
git commit -m "fix(company): final indigo cleanup after rebrand"
```
