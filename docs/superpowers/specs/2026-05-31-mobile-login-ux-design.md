# Mobile App Login UX — Design Spec

**Date:** 2026-05-31
**Branch:** feat/new-business-model
**Status:** Approved

---

## Problem

Three issues with the current mobile app login flow:

1. **Manual entry only asks for Store ID.** QR scan carries all three slugs (company + brand + store), but the manual entry form only has a Store ID field. This is ambiguous under the new hierarchy where store slugs are only unique per company.

2. **Remembered state is incomplete.** On app restart `loadStoredTenant` re-fetches with no company/brand context (global slug lookup). "Change Store" does a full reset — it clears company + brand and takes the user back to full setup, which is unnecessary if they just want to switch stores within the same brand.

3. **Login screen has no brand identity.** It shows a plain white background. The Store Portal web login uses a branded left panel with the primary color and geometric rings. The mobile login should carry the same brand feel as a full-screen background.

---

## Scope

Three files change:

| File | Change |
|---|---|
| `kioskly-app/contexts/TenantContext.tsx` | Fix `loadStoredTenant` to pass stored company+brand slugs on startup |
| `kioskly-app/app/tenant-setup.tsx` | Add Company Slug + Brand Slug fields to manual entry |
| `kioskly-app/app/index.tsx` | Full redesign: branded background, geometric rings, inline Change Store |

---

## Section 1: Storage & State Architecture

### What already exists
- `@kioscify:store_slug` — store slug string
- `@kioscify:brand_data` — full brand object JSON (includes `.slug`, `.themeColors`, `.logoUrl`)
- `@kioscify:company_data` — full company object JSON (includes `.slug`)

These are populated by `fetchTenantBySlug` whenever a store is loaded successfully. `clearTenant` already wipes all three — it is repurposed as "Change Company / Brand" with no code change.

### Fix: `loadStoredTenant`

Current: reads only `@kioscify:store_slug`, calls `fetchTenantBySlug(slug)` with no context.

New:
```typescript
const loadStoredTenant = useCallback(async () => {
  try {
    const [[, storedSlug], [, storedBrand], [, storedCompany]] =
      await AsyncStorage.multiGet([TENANT_SLUG_KEY, BRAND_DATA_KEY, COMPANY_DATA_KEY]);

    if (storedSlug) {
      const brand = storedBrand ? JSON.parse(storedBrand) : null;
      const company = storedCompany ? JSON.parse(storedCompany) : null;
      await fetchTenantBySlug(storedSlug, {
        companySlug: company?.slug,
        brandSlug: brand?.slug,
      });
    }
  } catch (err) {
    console.error('Failed to load stored tenant:', err);
  } finally {
    setInitializing(false);
  }
}, [fetchTenantBySlug]);
```

### Change Store (no new context method needed)

The login screen calls `fetchTenantBySlug(newStoreSlug, { companySlug: company?.slug, brandSlug: brand?.slug })` directly — company and brand are already in context state from the initial load. This updates the tenant while preserving the company/brand context.

### Change Company / Brand

Calls existing `clearTenant()` (wipes all three keys + state) then `router.replace('/tenant-setup')`. No change to `clearTenant`.

---

## Section 2: Tenant Setup Screen (`app/tenant-setup.tsx`)

Shown only on:
- First launch (no stored slugs)
- After "Change Company / Brand" (full reset)

### Layout

```
[Kioscify logo]
"Welcome to Kioscify"
"Scan to set up your store device, or enter manually below."

[Scan QR Code] ← orange outline button, full width

─── or enter manually ───

[Company Slug input]
[Brand Slug input]
[Store ID input]

"These are provided by your Kioscify platform administrator."

[Continue] ← disabled until all three fields filled
```

### Behavior

- **QR scan path**: unchanged — payload `{ v:1, company, brand, store }` already provides all three. `fetchTenantBySlug(store, { companySlug: company, brandSlug: brand })` is called on scan. No change needed.
- **Manual path**: on Continue, calls `fetchTenantBySlug(storeId.trim().toLowerCase(), { companySlug: companySlug.trim().toLowerCase(), brandSlug: brandSlug.trim().toLowerCase() })`.
- On success (either path): all three slugs + brand/company data stored in AsyncStorage → `router.replace('/')`.
- Error displayed inline below the form.

---

## Section 3: Login Screen (`app/index.tsx`) Redesign

### Background Layer

Full-screen branded background using the brand's primary color:

```typescript
const primaryColor = brand?.themeColors?.primary ?? '#ea580c';
```

Four decorative rings (absolute-positioned `View` elements, matching the web Store Portal left panel geometry):

| Ring | Position | Size | Style |
|---|---|---|---|
| Top-left | `top: -96, left: -96` | `384×384` | border 40px, white, 10% opacity |
| Bottom-right | `bottom: -128, right: -128` | `448×448` | border 50px, white, 10% opacity |
| Mid-right | `top: '50%', right: -64` | `256×256` | border 30px, white, 7% opacity |
| Bottom-left blob | `bottom: 96, left: 32` | `128×128` | filled white, 10% opacity |

### Content Layer

Centered vertically over the background:

```
[Logo — white rounded-2xl container, 96×96]
[Store/brand name — white bold text]

[White card — rounded-2xl, shadow]
  ← LOGIN STATE (default) →
    "Welcome back"
    [Username input]
    [Password input + show/hide]
    [Login button — primaryColor bg, white text]

  ← CHANGE STORE STATE (inline swap) →
    "Change Store"
    [Store ID input — empty, placeholder shows current store slug as hint]
    [Confirm button — primaryColor bg]
    [Cancel — small text link]

[Change Store button — white/60 text, below card]
[Change Company / Brand — white/40 smaller text, below that]
```

### State management

```typescript
const [mode, setMode] = useState<'login' | 'change-store'>('login');
const [newStoreSlug, setNewStoreSlug] = useState('');
const [changeStoreLoading, setChangeStoreLoading] = useState(false);
const [changeStoreError, setChangeStoreError] = useState('');
```

### Change Store handler

```typescript
const handleChangeStore = async () => {
  if (!newStoreSlug.trim()) return;
  setChangeStoreLoading(true);
  setChangeStoreError('');
  try {
    await fetchTenantBySlug(newStoreSlug.trim().toLowerCase(), {
      companySlug: company?.slug,
      brandSlug: brand?.slug,
    });
    setMode('login');
    setNewStoreSlug('');
  } catch {
    setChangeStoreError('Store not found. Please check the Store ID.');
  } finally {
    setChangeStoreLoading(false);
  }
};
```

### Change Company / Brand handler

```typescript
const handleChangeCompanyBrand = async () => {
  await clearTenant();
  router.replace('/tenant-setup');
};
```

### Logo source

Use `company?.logoUrl ?? brand?.logoUrl ?? tenant?.logoUrl` — company logo takes priority (same as current). Fall back to `LogoWithAppName` if none set.

---

## Files Changed

| File | Change |
|---|---|
| `kioskly-app/contexts/TenantContext.tsx` | `loadStoredTenant` reads stored brand/company, passes slugs on startup |
| `kioskly-app/app/tenant-setup.tsx` | Add Company Slug + Brand Slug inputs to manual entry form |
| `kioskly-app/app/index.tsx` | Full redesign: branded background, rings, white card, inline Change Store |

---

## Verification

1. **First launch** (no stored data): tenant-setup shows three fields + QR scan button
2. **Manual entry**: fill all three fields → Continue → login screen shows with correct brand color/logo
3. **QR scan**: scan a valid QR → straight to login screen (unchanged path)
4. **App restart**: no tenant-setup shown → straight to login with stored branding
5. **Change Store**: tap "Change Store" on login → card swaps to Store ID input → enter different store under same brand → confirm → card swaps back to login with updated store name/color
6. **Change Store — wrong slug**: enter invalid slug → error shown in card, can retry
7. **Change Company / Brand**: tap link → clears all storage → navigates to tenant-setup (three fields shown)
8. **Background rings**: visible behind the white card on login screen, color matches brand primary
9. **Logo visibility**: logo in white container, visible on any brand color
