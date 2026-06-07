# QR Code Store Setup — Design Spec

**Date:** 2026-05-30  
**Branch:** feat/new-business-model  
**Status:** Approved

---

## Problem

The mobile app's tenant-setup screen (`app/tenant-setup.tsx`) requires staff to manually type a Store ID/Slug. Under the new Company → Brand → Store hierarchy, store slugs are only unique per company — a plain slug lookup is ambiguous if two companies share the same slug. A pre-configured QR code eliminates manual entry and carries enough context (company + brand + store) for an unambiguous lookup.

---

## Chosen Approach: Plain JSON Slugs, Client-side QR Generation

QR codes are generated entirely in the browser using `react-qr-code`. No server-side generation endpoint is needed. The mobile app reads the QR, extracts the slugs, and passes them to the existing store-lookup API as query params.

---

## QR Data Format

```json
{ "v": 1, "company": "greatserve", "brand": "mr-lemon", "store": "mr-lemon-branch-1" }
```

- `v` — version field for future format changes (mobile validates `v === 1`)
- `company` — company slug
- `brand` — brand slug
- `store` — store slug

QR codes are valid indefinitely. If a store slug changes, a new QR must be generated and redistributed.

---

## Section 1: API Change

**File:** `kioskly-api/src/stores/stores.service.ts` (or `tenants/` if not yet renamed)

`GET /stores/slug/:slug` gains two optional query params:

| Param | Type | Purpose |
|---|---|---|
| `companySlug` | `string?` | Filter by company slug |
| `brandSlug` | `string?` | Filter by brand slug |

**Prisma query when both params are present:**
```typescript
prisma.tenant.findFirst({
  where: {
    slug,
    company: { slug: companySlug },
    brand: { slug: brandSlug },
  },
  include: { brand: true, company: true },
})
```

When params are absent (manual entry fallback), the query remains a global slug lookup as today.

**`TenantContext.fetchTenantBySlug` signature update:**
```typescript
fetchTenantBySlug(slug: string, options?: { companySlug?: string; brandSlug?: string }): Promise<void>
```
Appends `?companySlug=...&brandSlug=...` to the API URL when options are provided.

---

## Section 2: Shared `StoreQRModal` Component

A self-contained component used in both portals:

**Props:**
```typescript
interface StoreQRModalProps {
  storeName: string;
  companySlug: string;
  brandSlug: string;
  storeSlug: string;
  onClose: () => void;
}
```

**Contents:**
- QR code image rendered by `react-qr-code` from JSON payload
- Store name + slug label below the QR
- **Download PNG** — draws QR to `<canvas>` and triggers file download as `<storeSlug>-qr.png`
- **Print** — `window.print()` with a `@media print` CSS block that hides everything except the QR + label
- Close button

**Library:** `react-qr-code` (install in each portal package separately)

---

## Section 3: Platform Portal Changes

**File:** `kioscify-platform/app/(main)/companies/[id]/page.tsx`

### Stores Tab — Row-level QR button

Each store row in the Stores tab gets a **"QR Code"** button alongside the existing active toggle. Clicking opens `StoreQRModal` with the store's slugs.

The `stores` array already includes `store.slug` and `store.brand.slug`. The company slug comes from `company.slug` (already loaded on the page).

### After Onboarding — Inline QR display

After a store is onboarded successfully, the existing `PasswordBanner` is shown as today. Below it, the QR code for the new store is rendered inline (not in a modal) — same QR + label + Download + Print controls. This gives the admin immediate access to print/download right after setup without navigating to the Stores tab.

State addition:
```typescript
interface StoreQRData {
  storeName: string;
  companySlug: string;
  brandSlug: string;
  storeSlug: string;
}
const [newStoreQR, setNewStoreQR] = useState<StoreQRData | null>(null);
```
Set alongside `setStorePassword(...)` in `handleOnboardStore`, cleared by an X button.

---

## Section 4: Company Portal Changes

**File:** `kioscify-company/app/(main)/brands/[brandId]/page.tsx`

### Stores Tab — Row-level QR button

The Stores tab table gains a **"QR Code"** button in the Actions column for every store row — always visible regardless of `canOnboardStores`. Company admins who cannot onboard stores can still view and print/download the QR for device deployment.

The company slug is obtained from `brand.company.slug`. This requires the `GET /brands/:id` response to include the company relation (`include: { company: true }` in Prisma). The `Brand` type gains `company?: { slug: string; canOnboardStores: boolean }`. The brand slug is available from `brand.slug` already loaded on this page.

---

## Section 5: Mobile App Changes

**File:** `kioskly-app/app/tenant-setup.tsx`

### New dependency
`expo-camera` — install via `cd kioskly-app && npx expo install expo-camera`

### UI additions

Below the manual Store ID input, add a **"Scan QR Code"** button.

Tapping requests camera permission via `useCameraPermissions()`:
- **Granted** → opens `CameraView` fullscreen with `barCodeScannerSettings={{ barCodeTypes: ['qr'] }}` and a framed scan overlay
- **Denied** → shows inline message: *"Camera access is required to scan QR codes. [Enable in Settings] or use manual entry below."* — `[Enable in Settings]` calls `Linking.openSettings()`

### Scan handler

```typescript
const handleBarCodeScanned = async ({ data }: { data: string }) => {
  try {
    const payload = JSON.parse(data);
    if (payload.v !== 1 || !payload.company || !payload.brand || !payload.store) {
      setError('Invalid QR code. Please use manual entry.');
      return;
    }
    await fetchTenantBySlug(payload.store, {
      companySlug: payload.company,
      brandSlug: payload.brand,
    });
    router.replace('/');
  } catch {
    setError('Could not read QR code. Please try again or use manual entry.');
  }
};
```

After a successful scan, the camera closes and navigation proceeds to the login screen immediately (no confirmation step). Manual entry remains fully functional as a fallback.

---

## Files Changed

| File | Change |
|---|---|
| `kioskly-api/src/stores/stores.controller.ts` | Add `companySlug`, `brandSlug` query params to slug lookup endpoint |
| `kioskly-api/src/stores/stores.service.ts` | Update Prisma query to filter by company + brand slug when provided |
| `kioskly-app/contexts/TenantContext.tsx` | Add optional `options` param to `fetchTenantBySlug` |
| `kioskly-app/app/tenant-setup.tsx` | Add QR scanner button, camera view, permission handling |
| `kioscify-platform/app/(main)/companies/[id]/page.tsx` | Add QR button to store rows + inline QR after onboarding |
| `kioscify-platform/components/StoreQRModal.tsx` | New — QR modal with download + print |
| `kioscify-company/app/(main)/brands/[brandId]/page.tsx` | Add QR button to store rows in Stores tab; update brand API include to carry `company.slug` |
| `kioskly-api/src/brands/brands.service.ts` | Include `company` relation in `getBrandById` response |
| `kioscify-company/components/StoreQRModal.tsx` | New — QR modal with download + print (copy of platform version) |

---

## Permissions

**iOS** (`app.json` / `Info.plist`): Add `NSCameraUsageDescription` — "Used to scan store QR codes for device setup."

**Android** (`app.json` / `AndroidManifest.xml`): `expo-camera` adds `CAMERA` permission automatically via its plugin.

---

## Verification

1. Platform Portal: Onboard a store → QR displayed inline below password banner → Download PNG saves file → Print opens print dialog with QR only
2. Platform Portal: Stores tab → QR Code button on existing store → same modal
3. Company Portal (`canOnboardStores=true`): Brand → Stores tab → QR Code button visible
4. Company Portal (`canOnboardStores=false`): Brand → Stores tab → QR Code button still visible (view only)
5. Mobile app: Tap "Scan QR Code" → camera opens → scan valid QR → goes to login with correct store branding
6. Mobile app: Scan invalid/non-Kioscify QR → error shown, can retry
7. Mobile app: Deny camera permission → message shown with "Enable in Settings" link + manual entry still works
8. Mobile app: Manual entry still works independently of QR feature
