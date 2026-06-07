# Store Switcher Logo + Store Picker Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show brand logos in the sidebar store switcher and polish the store picker page rows to match the login page design language.

**Architecture:** Two isolated UI edits, no API changes. The URL resolution pattern (`apiBase` + path stripping) already exists in `Sidebar.tsx` and is reused for per-store logos. The store picker page structure is unchanged; only row internals are updated.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS, TypeScript

---

### Task 1: Add logoUrl to AccessibleStore + render brand logo in both switchers

**Files:**
- Modify: `kioskly-admin/components/Sidebar.tsx:68-73` (interface)
- Modify: `kioskly-admin/components/Sidebar.tsx:621-626` (collapsed popover avatar)
- Modify: `kioskly-admin/components/Sidebar.tsx:688-693` (expanded dropdown avatar)

**Context:**
- `apiBase` is already defined at line 165: `process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ?? "http://localhost:3000"`
- Both switchers are inside `accessibleStores.map(...)` — `avatarColor` is already computed per-store there
- The collapsed switcher is inside a Radix `<Popover.Content>`; the expanded one is in the inline dropdown `showStoreSwitcher` block

- [ ] **Step 1: Extend AccessibleStore interface**

In `Sidebar.tsx`, update the interface at line 68:

```typescript
interface AccessibleStore {
  id: string;
  name: string;
  slug: string;
  brand?: { name: string; logoUrl?: string; themeColors?: { primary: string } } | null;
}
```

- [ ] **Step 2: Update collapsed popover avatar (inside Popover.Content map)**

Locate this block (~line 621):
```tsx
<div
  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ring-2 ring-white shadow-sm"
  style={{ backgroundColor: avatarColor }}
>
  {store.name.charAt(0).toUpperCase()}
</div>
```

Replace with:
```tsx
{store.brand?.logoUrl ? (
  /* eslint-disable-next-line @next/next/no-img-element */
  <img
    src={(() => { try { const p = store.brand.logoUrl!.startsWith('http') ? new URL(store.brand.logoUrl!).pathname : store.brand.logoUrl!; return `${apiBase}${p}`; } catch { return store.brand.logoUrl!; } })()}
    alt={store.brand.name}
    className="w-7 h-7 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-sm"
  />
) : (
  <div
    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ring-2 ring-white shadow-sm"
    style={{ backgroundColor: avatarColor }}
  >
    {store.name.charAt(0).toUpperCase()}
  </div>
)}
```

- [ ] **Step 3: Update expanded dropdown avatar (inside showStoreSwitcher map)**

Locate this block (~line 688):
```tsx
<div
  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ring-2 ring-white shadow-sm"
  style={{ backgroundColor: avatarColor }}
>
  {store.name.charAt(0).toUpperCase()}
</div>
```

Replace with:
```tsx
{store.brand?.logoUrl ? (
  /* eslint-disable-next-line @next/next/no-img-element */
  <img
    src={(() => { try { const p = store.brand.logoUrl!.startsWith('http') ? new URL(store.brand.logoUrl!).pathname : store.brand.logoUrl!; return `${apiBase}${p}`; } catch { return store.brand.logoUrl!; } })()}
    alt={store.brand.name}
    className="w-7 h-7 rounded-full object-cover flex-shrink-0 ring-2 ring-white shadow-sm"
  />
) : (
  <div
    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ring-2 ring-white shadow-sm"
    style={{ backgroundColor: avatarColor }}
  >
    {store.name.charAt(0).toUpperCase()}
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd kioskly-admin && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add kioskly-admin/components/Sidebar.tsx
git commit -m "feat(store-portal): show brand logo in store switcher when available"
```

---

### Task 2: Polish store picker page row cards

**Files:**
- Modify: `kioskly-admin/app/store-picker/page.tsx:175-212` (store list rows)

**Context:**
- `apiBase` is already defined at line 66 of the file
- `storeColor` and `storeLogoSrc` are already computed per store in the map
- Each row is a `<button>` — we're adding a left accent bar as its first child and updating logo/avatar classes

- [ ] **Step 1: Update row layout — add accent bar, larger rounded-2xl logo**

Locate the `<button>` inner content starting at ~line 181. Replace the entire button contents (the avatar/img block, the text block, and the chevron/spinner block) with:

```tsx
{/* Accent bar */}
<div className="self-stretch w-[3px] rounded-full flex-shrink-0" style={{ backgroundColor: storeColor }} />

{/* Logo / avatar */}
{storeLogoSrc ? (
  /* eslint-disable-next-line @next/next/no-img-element */
  <img src={storeLogoSrc} alt={store.brand?.name ?? store.name} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" />
) : (
  <div
    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
    style={{ backgroundColor: storeColor }}
  >
    {store.name.charAt(0).toUpperCase()}
  </div>
)}

{/* Name + brand */}
<div className="flex-1 min-w-0">
  <p className="font-medium text-gray-900 truncate">{store.name}</p>
  {store.brand && (
    <p className="text-xs text-gray-500 truncate">{store.brand.name}</p>
  )}
</div>

{/* Trailing icon */}
<div className="flex-shrink-0">
  {isLoading ? (
    <div
      className="w-5 h-5 border-2 rounded-full animate-spin"
      style={{ borderColor: storeColor, borderTopColor: 'transparent' }}
    />
  ) : (
    <ChevronRight className="w-5 h-5 text-gray-400" />
  )}
</div>
```

- [ ] **Step 2: Update button padding to px-5**

On the `<button>` element for each store row, change `px-4 py-4` to `px-5 py-4`.

The button's className should read:
```tsx
className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition disabled:opacity-60 text-left"
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd kioskly-admin && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add kioskly-admin/app/store-picker/page.tsx
git commit -m "feat(store-portal): polish store picker rows with brand accent and rounded-2xl logos"
```
