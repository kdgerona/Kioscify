# Store Switcher Logo + Store Picker Polish

**Date:** 2026-06-05  
**Status:** Approved

## Summary

Two UI polish changes to the Store Portal (`kioskly-admin`):

1. Show brand logo in the sidebar Switch Store switcher when available
2. Enhance the store picker page store list rows to match the login page design language

---

## Change 1 — Brand Logo in Switch Store Switcher

**File:** `kioskly-admin/components/Sidebar.tsx`

### What changes

- Extend `AccessibleStore` interface: add `logoUrl?: string` to the `brand` field
- In both the **collapsed popover** (Radix Popover, ~line 620) and the **expanded dropdown** (~line 680), replace the letter-avatar `<div>` with an `<img>` tag when `store.brand.logoUrl` is present
- Use the same URL resolution pattern already in `LoginForm.tsx` and `store-picker/page.tsx`: strip `/api/v1` from `NEXT_PUBLIC_API_URL` and prefix the stored path
- Fall back to the existing letter-avatar when no logo is available (no visual change for logo-less stores)

### Constraints

- `apiBase` constant derived the same way as in the other two files: `process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3000'`
- `<img>` uses `className="w-7 h-7 rounded-full object-cover"` to match the current avatar size and circular shape in the switcher

---

## Change 2 — Store Picker Page Row Enhancement

**File:** `kioskly-admin/app/store-picker/page.tsx`

The split-panel layout, decorative rings, mobile header, and powered-by pill are already consistent with `LoginForm.tsx` and are **not changed**.

### What changes in store list rows

| Element | Before | After |
|---|---|---|
| Logo shape | `rounded-full` (circle) | `rounded-2xl` (rounded square) |
| Logo size | `w-10 h-10` | `w-12 h-12` |
| Fallback avatar | `rounded-full` | `rounded-2xl` |
| Left accent bar | none | 3px vertical bar in `store.brand?.themeColors?.primary` color |
| Horizontal padding | `px-4` | `px-5` |

### Accent bar implementation

Add a `<div>` as the first child of each row button:
```tsx
<div className="self-stretch w-[3px] rounded-full flex-shrink-0" style={{ backgroundColor: storeColor }} />
```

### No changes to

- Loading spinner, chevron icon, hover state, brand name subtitle, dividers, container border/radius

---

## Scope

No API changes. No new dependencies. Two files modified.
