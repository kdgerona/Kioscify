# QR Code Store Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-store QR codes to the Platform and Company portals so tablets can scan instead of manually entering a Store ID, eliminating ambiguity in the new Company → Brand → Store hierarchy.

**Architecture:** QR codes encode a plain JSON payload `{ v:1, company, brand, store }` and are generated client-side in the browser using `react-qr-code`. The mobile app's `tenant-setup.tsx` gains a camera scanner via `expo-camera`. The only backend change is adding a `brandSlug` query param to the existing `GET /stores/slug/:slug` endpoint (which already accepts `companySlug`), and including `company` in the brand detail response.

**Tech Stack:** NestJS + Prisma (API), Next.js 15 App Router (portals), `react-qr-code` (QR generation), Expo SDK 54 + `expo-camera` (mobile scanner), React Native + NativeWind (mobile UI).

**Spec:** `docs/superpowers/specs/2026-05-30-qr-store-setup-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `kioskly-api/src/stores/stores.controller.ts` | Modify | Add `@Query('brandSlug')` param |
| `kioskly-api/src/stores/stores.service.ts` | Modify | Add `brandSlug` filter to `findBySlug` |
| `kioskly-api/src/brands/brands.service.ts` | Modify | Include `company` in `findOne` response |
| `kioscify-company/types/index.ts` | Modify | Add `company?: { slug: string; canOnboardStores: boolean }` to `Brand` |
| `kioskly-app/contexts/TenantContext.tsx` | Modify | Add `options?: { companySlug?: string; brandSlug?: string }` to `fetchTenantBySlug` |
| `kioskly-app/app/tenant-setup.tsx` | Modify | Add QR scanner button, camera view, permission handling |
| `kioskly-app/app.json` | Modify | Add camera permission description for iOS/Android plugin |
| `kioscify-platform/components/StoreQRModal.tsx` | Create | QR modal with download PNG + print, used in platform portal |
| `kioscify-platform/app/(main)/companies/[id]/page.tsx` | Modify | QR button per store row + inline QR card after onboarding |
| `kioscify-company/components/StoreQRModal.tsx` | Create | QR modal with download PNG + print, used in company portal |
| `kioscify-company/app/(main)/brands/[brandId]/page.tsx` | Modify | QR button per store row in Stores tab |

---

## Task 1: API — add `brandSlug` filter to store slug lookup

**Files:**
- Modify: `kioskly-api/src/stores/stores.controller.ts`
- Modify: `kioskly-api/src/stores/stores.service.ts`

The endpoint `GET /stores/slug/:slug` already accepts `?companySlug`. Add `?brandSlug` so the lookup is fully scoped to company + brand + store.

- [ ] **Step 1: Update `stores.controller.ts` — add `brandSlug` query param**

Find this block (around line 68):
```typescript
@Get('slug/:slug')
@Public()
@ApiOperation({
  summary: 'Get store by slug — public, used for login branding before auth',
})
@ApiQuery({ name: 'companySlug', required: false })
findBySlug(
  @Param('slug') slug: string,
  @Query('companySlug') companySlug?: string,
) {
  return this.storesService.findBySlug(slug, companySlug);
}
```

Replace with:
```typescript
@Get('slug/:slug')
@Public()
@ApiOperation({
  summary: 'Get store by slug — public, used for login branding before auth',
})
@ApiQuery({ name: 'companySlug', required: false })
@ApiQuery({ name: 'brandSlug', required: false })
findBySlug(
  @Param('slug') slug: string,
  @Query('companySlug') companySlug?: string,
  @Query('brandSlug') brandSlug?: string,
) {
  return this.storesService.findBySlug(slug, companySlug, brandSlug);
}
```

- [ ] **Step 2: Update `stores.service.ts` — use brandSlug in Prisma query**

Find this method (around line 65):
```typescript
async findBySlug(slug: string, companySlug?: string) {
  const where = companySlug
    ? { slug, tombstone: { not: 1 }, company: { slug: companySlug } }
    : { slug, tombstone: { not: 1 } };
```

Replace with:
```typescript
async findBySlug(slug: string, companySlug?: string, brandSlug?: string) {
  const where: Record<string, any> = { slug, tombstone: { not: 1 } };
  if (companySlug) where.company = { slug: companySlug };
  if (brandSlug) where.brand = { slug: brandSlug };
```

- [ ] **Step 3: Manual verification**

With the API running (`npm run api:dev`), run in a terminal:
```bash
curl "http://localhost:3000/api/v1/stores/slug/mr-lemon-branch-1?companySlug=greatserve&brandSlug=mr-lemon"
```
Expected: returns store JSON with brand + company. Without `brandSlug`, the same request still works (backward compat for manual entry). With a wrong `brandSlug`, returns 404.

- [ ] **Step 4: Commit**

```bash
git add kioskly-api/src/stores/stores.controller.ts kioskly-api/src/stores/stores.service.ts
git commit -m "feat(api): add brandSlug filter to GET /stores/slug/:slug"
```

---

## Task 2: API — include `company` in brand detail response

**Files:**
- Modify: `kioskly-api/src/brands/brands.service.ts`

The company portal brand detail page uses `GET /brands/:id`. The company slug must be in the response so the portal can build the QR payload.

- [ ] **Step 1: Update `brands.service.ts` `findOne` — include company**

Find the `findOne` method (around line 48). The current include is:
```typescript
include: {
  stores: {
    select: { id: true, name: true, slug: true, isActive: true },
  },
  _count: { select: { stores: true, products: true, categories: true, inventoryItems: true } },
},
```

Replace with:
```typescript
include: {
  stores: {
    select: { id: true, name: true, slug: true, isActive: true },
  },
  company: {
    select: { slug: true, canOnboardStores: true },
  },
  _count: { select: { stores: true, products: true, categories: true, inventoryItems: true } },
},
```

- [ ] **Step 2: Manual verification**

With the API running, authenticate as a COMPANY_ADMIN and call:
```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/v1/brands/<brandId>"
```
Expected: response includes `"company": { "slug": "greatserve", "canOnboardStores": true }`.

- [ ] **Step 3: Commit**

```bash
git add kioskly-api/src/brands/brands.service.ts
git commit -m "feat(api): include company slug in brand detail response"
```

---

## Task 3: Company Portal — add `company` to `Brand` type

**Files:**
- Modify: `kioscify-company/types/index.ts`

- [ ] **Step 1: Add `company` field to the `Brand` interface**

Find the `Brand` interface in `kioscify-company/types/index.ts`. Add the `company` field:

```typescript
export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  companyId: string;
  company?: {
    slug: string;
    canOnboardStores: boolean;
  };
  themeColors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  isActive: boolean;
  storeCount?: number;
  productCount?: number;
  inventoryItemCount?: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-company/types/index.ts
git commit -m "feat(company): add company slug to Brand type"
```

---

## Task 4: Mobile App — update `TenantContext.fetchTenantBySlug`

**Files:**
- Modify: `kioskly-app/contexts/TenantContext.tsx`

Add an optional second argument so the QR scan path can pass `companySlug` and `brandSlug`.

- [ ] **Step 1: Update the `TenantContextType` interface**

Find the interface (around line 51). Change:
```typescript
fetchTenantBySlug: (slug: string) => Promise<void>;
```
To:
```typescript
fetchTenantBySlug: (slug: string, options?: { companySlug?: string; brandSlug?: string }) => Promise<void>;
```

- [ ] **Step 2: Update `fetchTenantBySlug` implementation**

Find the `fetchTenantBySlug` callback (around line 86). Change the signature and URL building:

```typescript
const fetchTenantBySlug = useCallback(async (
  slug: string,
  options?: { companySlug?: string; brandSlug?: string },
) => {
  setLoading(true);
  setError(null);
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error(
        "API URL is not configured. Please set EXPO_PUBLIC_API_URL in your .env file"
      );
    }
    const params = new URLSearchParams();
    if (options?.companySlug) params.set('companySlug', options.companySlug);
    if (options?.brandSlug) params.set('brandSlug', options.brandSlug);
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${apiUrl}/stores/slug/${slug}${query}`);
    // ... rest of the function unchanged from line 98 onwards
```

Leave everything after the `fetch` call unchanged (the `if (!response.ok)` block, data handling, AsyncStorage writes, etc).

- [ ] **Step 3: Manual verification**

After the mobile app builds, the existing manual-entry flow (no options passed) must work identically — the URL falls back to `/stores/slug/:slug` with no query params.

- [ ] **Step 4: Commit**

```bash
git add kioskly-app/contexts/TenantContext.tsx
git commit -m "feat(app): add companySlug+brandSlug options to fetchTenantBySlug"
```

---

## Task 5: Mobile App — install `expo-camera` + add QR scanner

**Files:**
- Modify: `kioskly-app/app.json`
- Modify: `kioskly-app/app/tenant-setup.tsx`

- [ ] **Step 1: Install `expo-camera`**

```bash
cd kioskly-app && npx expo install expo-camera
```

Expected output: package added to `package.json` with the version compatible with Expo SDK 54.

- [ ] **Step 2: Add camera permission to `app.json`**

Open `kioskly-app/app.json`. In the `"ios"` block, add `"infoPlist"`:
```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.kioskly.app",
  "infoPlist": {
    "NSCameraUsageDescription": "Used to scan store QR codes for device setup."
  }
}
```

In the `"plugins"` array, add the expo-camera plugin:
```json
"plugins": [
  "expo-router",
  "expo-camera",
  [
    "expo-splash-screen",
    ...
  ]
]
```

- [ ] **Step 3: Replace `kioskly-app/app/tenant-setup.tsx` with QR-scanner version**

```tsx
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Linking,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useTenant } from "../contexts/TenantContext";
import AppLogo from "../assets/images/logo-only.png";

interface QRPayload {
  v: number;
  company: string;
  brand: string;
  store: string;
}

export default function TenantSetup() {
  const [slug, setSlug] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const router = useRouter();
  const { fetchTenantBySlug, loading, error } = useTenant();
  const [permission, requestPermission] = useCameraPermissions();

  const handleContinue = async () => {
    if (!slug.trim()) return;
    try {
      await fetchTenantBySlug(slug.trim().toLowerCase());
      router.replace("/");
    } catch (err) {
      console.error("Failed to fetch tenant:", err);
    }
  };

  const handleScanPress = async () => {
    setScanError("");
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return; // permission denied — UI below handles it
    }
    setScanning(true);
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    setScanning(false);
    setScanError("");
    try {
      const payload: QRPayload = JSON.parse(data);
      if (
        payload.v !== 1 ||
        !payload.company ||
        !payload.brand ||
        !payload.store
      ) {
        setScanError("Invalid QR code. Please use manual entry below.");
        return;
      }
      await fetchTenantBySlug(payload.store, {
        companySlug: payload.company,
        brandSlug: payload.brand,
      });
      router.replace("/");
    } catch {
      setScanError("Could not read QR code. Please try again or use manual entry below.");
    }
  };

  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={handleBarCodeScanned}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: "space-between", alignItems: "center", padding: 24 }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600", textAlign: "center", marginTop: 16 }}>
              Point the camera at a Kioscify store QR code
            </Text>
            {/* Scan frame overlay */}
            <View style={{ width: 240, height: 240, borderWidth: 2, borderColor: "white", borderRadius: 16, opacity: 0.8 }} />
            <TouchableOpacity
              onPress={() => setScanning(false)}
              style={{ paddingVertical: 12, paddingHorizontal: 32, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8, marginBottom: 16 }}
            >
              <Text style={{ color: "white", fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 32, paddingVertical: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={20}
      >
        <View className="w-full max-w-md flex-1 justify-center self-center">
          <View className="flex-col items-center justify-center mb-6">
            <Image
              source={AppLogo}
              resizeMode="contain"
              className="w-64 h-64"
            />
            <Text className="text-3xl font-bold text-orange-600 mb-2 text-center mt-[-40] w-full">
              Welcome to Kioscify
            </Text>
            <Text className="text-gray-600 mb-8 text-center">
              Enter your store identifier to continue
            </Text>
          </View>

          {/* QR scan button */}
          <TouchableOpacity
            className="w-full rounded-lg py-3 items-center mb-4 border-2 border-orange-500"
            onPress={handleScanPress}
            disabled={loading}
          >
            <Text className="text-orange-500 text-base font-semibold">
              Scan QR Code
            </Text>
          </TouchableOpacity>

          {/* Permission denied message */}
          {permission && !permission.granted && (
            <View className="mb-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <Text className="text-sm text-orange-800 text-center">
                Camera access is required to scan QR codes.{" "}
                <Text
                  className="font-semibold underline"
                  onPress={() => Linking.openSettings()}
                >
                  Enable in Settings
                </Text>
                {" "}or use manual entry below.
              </Text>
            </View>
          )}

          <View className="flex-row items-center mb-4">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="mx-3 text-xs text-gray-400">or enter manually</Text>
            <View className="flex-1 h-px bg-gray-200" />
          </View>

          <View className="mb-6">
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              Store ID / Slug
            </Text>
            <TextInput
              className="w-full bg-gray-100 rounded-lg px-4 py-3 text-base"
              placeholder="e.g., my-store"
              value={slug}
              onChangeText={setSlug}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <Text className="text-xs text-gray-500 mt-1">
              Ask your administrator for your store identifier
            </Text>
          </View>

          {(error || scanError) && (
            <View className="bg-red-100 border border-red-400 rounded-lg p-3 mb-4">
              <Text className="text-red-700 text-sm">{error || scanError}</Text>
            </View>
          )}

          <TouchableOpacity
            className={`w-full rounded-lg py-3 items-center ${
              loading || !slug.trim() ? "bg-gray-300" : "bg-orange-500"
            }`}
            onPress={handleContinue}
            disabled={loading || !slug.trim()}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-base font-semibold">
                Continue
              </Text>
            )}
          </TouchableOpacity>

          <View className="mt-8 p-4 bg-orange-50 rounded-lg">
            <Text className="text-sm font-semibold text-orange-800 mb-2">
              💡 What is a Store ID?
            </Text>
            <Text className="text-xs text-gray-600">
              Your Store ID (slug) is a unique identifier for your business.
              It&apos;s used to load your custom branding, theme, and settings.
              Contact your system administrator if you don&apos;t have this
              information.
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Verify app builds without errors**

```bash
cd kioskly-app && npm start -- --reset-cache
```

Expected: Expo dev server starts, no TypeScript errors in the console. On a physical device or simulator, the tenant-setup screen shows both "Scan QR Code" button and the manual entry form.

- [ ] **Step 5: Commit**

```bash
git add kioskly-app/app.json kioskly-app/app/tenant-setup.tsx kioskly-app/package.json
git commit -m "feat(app): add QR code scanner to tenant setup screen"
```

---

## Task 6: Platform Portal — create `StoreQRModal` component

**Files:**
- Create: `kioscify-platform/components/StoreQRModal.tsx`

- [ ] **Step 1: Install `react-qr-code` in the platform portal**

```bash
npm install react-qr-code --workspace=kioscify-platform
```

Expected: `react-qr-code` appears in `kioscify-platform/package.json` dependencies.

- [ ] **Step 2: Create `kioscify-platform/components/StoreQRModal.tsx`**

```tsx
'use client';

import QRCode from 'react-qr-code';
import { X, Download, Printer } from 'lucide-react';

interface StoreQRModalProps {
  storeName: string;
  companySlug: string;
  brandSlug: string;
  storeSlug: string;
  onClose: () => void;
}

export default function StoreQRModal({
  storeName,
  companySlug,
  brandSlug,
  storeSlug,
  onClose,
}: StoreQRModalProps) {
  const qrValue = JSON.stringify({
    v: 1,
    company: companySlug,
    brand: brandSlug,
    store: storeSlug,
  });

  const downloadPng = () => {
    const svg = document.getElementById('store-qr-svg') as SVGSVGElement | null;
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const link = document.createElement('a');
      link.download = `${storeSlug}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const printQR = () => {
    const svg = document.getElementById('store-qr-svg') as SVGSVGElement | null;
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${storeName} QR Code</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center;
                   justify-content: center; min-height: 100vh; font-family: sans-serif; gap: 12px; }
            svg { width: 256px; height: 256px; }
            .name { font-size: 16px; font-weight: 600; }
            .slug { font-size: 12px; color: #666; font-family: monospace; }
          </style>
        </head>
        <body>
          ${serialized}
          <p class="name">${storeName}</p>
          <p class="slug">${storeSlug}</p>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold text-gray-900">Store QR Code</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <QRCode
              value={qrValue}
              size={220}
              id="store-qr-svg"
            />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{storeName}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{storeSlug}</p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={downloadPng}
              className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
            <button
              onClick={printQR}
              className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build --workspace=kioscify-platform 2>&1 | grep -E "error|Error" | head -10
```

Expected: no TypeScript errors related to `StoreQRModal.tsx`.

- [ ] **Step 4: Commit**

```bash
git add kioscify-platform/components/StoreQRModal.tsx kioscify-platform/package.json
git commit -m "feat(platform): add StoreQRModal component with download and print"
```

---

## Task 7: Platform Portal — wire QR to store rows and post-onboarding banner

**Files:**
- Modify: `kioscify-platform/app/(main)/companies/[id]/page.tsx`

- [ ] **Step 1: Add imports at the top of the file**

Find the existing imports block. Add `QrCode` to the lucide import and import `StoreQRModal`:

```typescript
import {
  ChevronLeft,
  Plus,
  X,
  Copy,
  Check,
  Save,
  UserPlus,
  Store as StoreIcon,
  Upload,
  Pencil,
  QrCode,          // ← add this
} from 'lucide-react';
import StoreQRModal from '@/components/StoreQRModal';   // ← add this
```

- [ ] **Step 2: Add state for QR modal and post-onboarding inline QR**

Find the state declarations block (near line 170). Add after `storePassword` state:

```typescript
// QR modal
const [qrStore, setQrStore] = useState<{
  storeName: string;
  companySlug: string;
  brandSlug: string;
  storeSlug: string;
} | null>(null);

// Inline QR shown after onboarding
const [newStoreQR, setNewStoreQR] = useState<{
  storeName: string;
  companySlug: string;
  brandSlug: string;
  storeSlug: string;
} | null>(null);
```

- [ ] **Step 3: Set `newStoreQR` in `handleOnboardStore` after success**

Find `handleOnboardStore`. In the `storeAdminMode === 'existing'` branch, after `setStores(prev => [...prev, result.store])`, add:
```typescript
setNewStoreQR({
  storeName: result.store.name,
  companySlug: company!.slug,
  brandSlug: brands.find(b => b.id === showOnboardStore.brandId)?.slug ?? '',
  storeSlug: result.store.slug,
});
```

In the `storeAdminMode !== 'existing'` branch (the `else`), after `setStores(prev => [...prev, result.store])`, add:
```typescript
setNewStoreQR({
  storeName: result.store.name,
  companySlug: company!.slug,
  brandSlug: brands.find(b => b.id === showOnboardStore.brandId)?.slug ?? '',
  storeSlug: result.store.slug,
});
```

- [ ] **Step 4: Render inline QR banner after the `storePassword` banner**

Find the password banners section (around line 499):
```tsx
{storePassword && (
  <PasswordBanner
    title={`Store "${storePassword.storeName}" onboarded successfully`}
    password={storePassword.password}
    onClose={() => setStorePassword(null)}
  />
)}
```

Add directly after it:
```tsx
{newStoreQR && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
    <div className="flex items-center justify-between mb-3">
      <p className="text-blue-800 font-medium text-sm flex items-center gap-2">
        <QrCode className="w-4 h-4" />
        Device Setup QR Code — {newStoreQR.storeName}
      </p>
      <button onClick={() => setNewStoreQR(null)} className="text-blue-600 hover:text-blue-800">
        <X className="w-4 h-4" />
      </button>
    </div>
    <p className="text-xs text-blue-600 mb-3">
      Scan this QR code on a tablet to configure it for this store instantly.
    </p>
    <button
      onClick={() => setQrStore(newStoreQR)}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
    >
      <QrCode className="w-4 h-4" />
      View / Download QR Code
    </button>
  </div>
)}
```

- [ ] **Step 5: Add QR Code button to each store row in the Stores tab**

Find the Stores tab store row (around line 746). The row currently ends with the active toggle. Add a QR button before the toggle:

```tsx
<div className="flex items-center gap-3 shrink-0">
  <button
    onClick={() => setQrStore({
      storeName: store.name,
      companySlug: company!.slug,
      brandSlug: store.brand?.slug ?? '',
      storeSlug: store.slug,
    })}
    title="View QR Code"
    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded transition-colors"
  >
    <QrCode className="w-4 h-4" />
  </button>
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
    store.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
  }`}>
    {store.isActive ? 'Active' : 'Inactive'}
  </span>
  {/* existing toggle button stays here */}
```

- [ ] **Step 6: Render `StoreQRModal` at the bottom of the component**

Find the closing `</div>` at the very end of the component's JSX (after all the modals). Add before it:

```tsx
{qrStore && (
  <StoreQRModal
    storeName={qrStore.storeName}
    companySlug={qrStore.companySlug}
    brandSlug={qrStore.brandSlug}
    storeSlug={qrStore.storeSlug}
    onClose={() => setQrStore(null)}
  />
)}
```

- [ ] **Step 7: Manual verification**

1. Start the platform portal: `npm run platform:dev`
2. Navigate to a company → Stores tab
3. Click the QR icon on a store row → modal opens, shows QR code
4. Click "Download PNG" → PNG file downloaded named `<slug>-qr.png`
5. Click "Print" → print dialog opens in new window with QR code only
6. Onboard a new store → after modal closes, blue QR banner appears below password banner
7. Click "View / Download QR Code" → QR modal opens for the newly created store

- [ ] **Step 8: Commit**

```bash
git add kioscify-platform/app/'(main)'/companies/'[id]'/page.tsx
git commit -m "feat(platform): add QR code button to store rows and post-onboarding banner"
```

---

## Task 8: Company Portal — create `StoreQRModal` and wire to stores tab

**Files:**
- Create: `kioscify-company/components/StoreQRModal.tsx`
- Modify: `kioscify-company/app/(main)/brands/[brandId]/page.tsx`

- [ ] **Step 1: Install `react-qr-code` in the company portal**

```bash
npm install react-qr-code --workspace=kioscify-company
```

- [ ] **Step 2: Create `kioscify-company/components/StoreQRModal.tsx`**

This is identical to the platform portal version. Copy it exactly:

```tsx
'use client';

import QRCode from 'react-qr-code';
import { X, Download, Printer } from 'lucide-react';

interface StoreQRModalProps {
  storeName: string;
  companySlug: string;
  brandSlug: string;
  storeSlug: string;
  onClose: () => void;
}

export default function StoreQRModal({
  storeName,
  companySlug,
  brandSlug,
  storeSlug,
  onClose,
}: StoreQRModalProps) {
  const qrValue = JSON.stringify({
    v: 1,
    company: companySlug,
    brand: brandSlug,
    store: storeSlug,
  });

  const downloadPng = () => {
    const svg = document.getElementById('store-qr-svg') as SVGSVGElement | null;
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);
      const link = document.createElement('a');
      link.download = `${storeSlug}-qr.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const printQR = () => {
    const svg = document.getElementById('store-qr-svg') as SVGSVGElement | null;
    if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${storeName} QR Code</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center;
                   justify-content: center; min-height: 100vh; font-family: sans-serif; gap: 12px; }
            svg { width: 256px; height: 256px; }
            .name { font-size: 16px; font-weight: 600; }
            .slug { font-size: 12px; color: #666; font-family: monospace; }
          </style>
        </head>
        <body>
          ${serialized}
          <p class="name">${storeName}</p>
          <p class="slug">${storeSlug}</p>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold text-gray-900">Store QR Code</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <QRCode
              value={qrValue}
              size={220}
              id="store-qr-svg"
            />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900">{storeName}</p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{storeSlug}</p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={downloadPng}
              className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
            <button
              onClick={printQR}
              className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `brands/[brandId]/page.tsx` — add imports**

Find the existing imports. Add `QrCode` to lucide import and import `StoreQRModal`:

```typescript
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, Save, QrCode } from 'lucide-react';
import StoreQRModal from '@/components/StoreQRModal';
```

- [ ] **Step 4: Add QR modal state to `BrandDetailPage`**

Find the state declarations. After the `editingStoreName` state, add:

```typescript
const [qrStore, setQrStore] = useState<{
  storeName: string;
  companySlug: string;
  brandSlug: string;
  storeSlug: string;
} | null>(null);
```

- [ ] **Step 5: Add QR button to the Stores tab table**

Find the Stores tab table. The `<th>` row currently has `Store Name`, `Store ID / Slug`, `Actions`. The `Actions` cell currently shows only an `Edit` button or Save/Cancel inline edit controls.

Replace the entire `<td>` for actions (the rightmost column in each store row) with:

```tsx
<td className="px-6 py-4 text-right">
  <div className="flex items-center justify-end gap-3">
    <button
      onClick={() => setQrStore({
        storeName: store.name,
        companySlug: brand?.company?.slug ?? '',
        brandSlug: brand?.slug ?? '',
        storeSlug: store.slug,
      })}
      title="View QR Code"
      className="text-gray-400 hover:text-indigo-600 transition-colors"
    >
      <QrCode className="w-4 h-4" />
    </button>
    {editingStoreId === store.id ? (
      <div className="flex gap-3">
        <button onClick={() => handleSaveStoreName(store.id)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Save</button>
        <button onClick={() => setEditingStoreId(null)} className="text-sm text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
    ) : (
      <button
        onClick={() => { setEditingStoreId(store.id); setEditingStoreName(store.name); }}
        className="text-sm text-gray-400 hover:text-gray-600"
      >
        Edit
      </button>
    )}
  </div>
</td>
```

- [ ] **Step 6: Render `StoreQRModal` at the bottom of the component's JSX**

Find the closing `</div>` at the end of `BrandDetailPage`'s return statement (after the last closing `</div>` of the main content). Add before it:

```tsx
{qrStore && (
  <StoreQRModal
    storeName={qrStore.storeName}
    companySlug={qrStore.companySlug}
    brandSlug={qrStore.brandSlug}
    storeSlug={qrStore.storeSlug}
    onClose={() => setQrStore(null)}
  />
)}
```

- [ ] **Step 7: Manual verification**

1. Start the company portal: `npm run company:dev`
2. Log in as a COMPANY_ADMIN
3. Navigate to a brand → Stores tab
4. Confirm QR icon appears for every store row (regardless of `canOnboardStores`)
5. Click QR icon → modal opens with correct store name and QR code
6. Confirm `brand.company?.slug` is populated (requires Task 2 API change to be deployed/running)
7. Download PNG → file saved as `<slug>-qr.png`
8. Print → print dialog opens in new tab

- [ ] **Step 8: Commit**

```bash
git add kioscify-company/components/StoreQRModal.tsx kioscify-company/app/'(main)'/brands/'[brandId]'/page.tsx kioscify-company/package.json
git commit -m "feat(company): add QR code modal to brand stores tab"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Verify QR → mobile flow**

1. Open platform portal → navigate to a company's Stores tab
2. Click QR icon on a store → note the QR value shown (`JSON.stringify({ v:1, company, brand, store })`)
3. On the mobile app (physical device or simulator), go to the tenant-setup screen
4. Tap "Scan QR Code"
5. Point camera at the QR code shown on screen (or print it first)
6. Confirm the app navigates straight to the login screen with the store's branding (correct logo, theme color)
7. Log in — confirm login succeeds and dashboard loads

- [ ] **Step 2: Verify permission-denied flow**

On iOS simulator: Settings → Privacy → Camera → disable for the app. Return to tenant-setup, tap "Scan QR Code" — confirm the orange "Camera access is required" message appears with a tappable "Enable in Settings" link. Confirm manual entry still works.

- [ ] **Step 3: Verify backward compatibility**

In the mobile app, use manual entry (no QR). Confirm it still works without `companySlug` / `brandSlug` params (calls `GET /stores/slug/:slug` with no extra params — global lookup).

- [ ] **Step 4: Final commit + push**

```bash
git push origin feat/new-business-model
```
