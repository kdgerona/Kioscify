# Platform Portal Branding & UI Redesign

**Date:** 2026-06-09  
**Scope:** kioscify-platform — login page, change-password page, sidebar/layout, tailwind config

---

## Goal

Bring the platform portal in line with Kioscify's brand identity and the modern split-screen UI already established in kioscify-company and kioskly-admin. Replace the indigo accent color with the Kioscify brand orange throughout.

---

## Brand Token

Add a `brand` color token to `tailwind.config.ts`:

```ts
brand: {
  DEFAULT: "#ea580c",   // Tailwind orange-600
}
```

Use `bg-brand`, `text-brand`, `border-brand`, `ring-brand` everywhere `indigo-*` is currently used.

---

## 1. Login Page (`app/login/page.tsx`)

Replace the centered white card layout with a split-screen layout matching kioscify-company's `LoginForm.tsx`:

### Left panel (desktop only, `lg:w-5/12 xl:w-1/2`)
- Background: `#ea580c` (brand orange)
- Decorative semi-transparent rings (same 4-ring pattern from company portal)
- Logo: `logo-full.png` at `w-28 h-28`, white rounded-2xl container with `p-3 shadow-lg`
- Title: "Kioscify" — `text-3xl font-bold`
- Subtitle: "Platform Administration" — muted white
- Feature pills: `Companies · Stores · Users · Analytics`

### Right panel (full width on mobile)
- White background
- Mobile-only brand header: `logo-full.png` at `w-16 h-16` + "Kioscify" title
- Form heading: "Sign in" (`text-2xl font-bold`) + "Sign in to Platform Admin" subtitle
- Inputs: `px-4 py-3 border border-gray-200 rounded-xl`, CSS variable `--tw-ring-color: #ea580c` for focus ring
- Password field: show/hide toggle with Eye/EyeOff icons
- Submit button: `bg-[#ea580c] text-white rounded-xl py-3 font-semibold hover:brightness-90`
- Footer: "Powered by Kioscify" pill (logo + text, border, rounded-full)

---

## 2. Change-Password Page (`app/change-password/page.tsx`)

Replace the plain white card with the same split-screen layout:

### Left panel
- Identical to login left panel (same orange, rings, logo, "Kioscify" title, same pills)

### Right panel
- Mobile-only brand header (same as login)
- Form header: `KeyRound` icon in gray-100 rounded-xl box + "Set New Password" title + security subtitle
- Three password fields (Current, New, Confirm), each with show/hide toggle
- "New Password" hint text: "Min 10 chars · uppercase · lowercase · number · special character"
- Submit button: same orange style as login
- Cancel button: text-only (`text-gray-500 hover:text-gray-700 hover:bg-gray-50`)
- Footer: "Powered by Kioscify" pill

### Utility
Add `getContrastColor(hex)` to `lib/utils.ts` (copied from kioscify-company — calculates whether text on a given bg color should be white or dark).

---

## 3. Main Layout (`app/(main)/layout.tsx`)

- Active nav item: `bg-indigo-600` → `bg-brand`
- Loading spinner: `border-indigo-400` → `border-brand`
- Sidebar logo (`logo.png`): `w-7 h-7` → `w-9 h-9`
- Mobile header logo (`logo.png`): `w-5 h-5` → `w-7 h-7`

---

## Files Changed

| File | Change |
|---|---|
| `tailwind.config.ts` | Add `brand` color token |
| `lib/utils.ts` | Add `getContrastColor` |
| `app/login/page.tsx` | Full redesign to split-screen |
| `app/change-password/page.tsx` | Full redesign to split-screen |
| `app/(main)/layout.tsx` | Replace indigo → brand, larger logos |

No new dependencies required. Lucide icons (`KeyRound`) are already available via existing lucide-react install.
