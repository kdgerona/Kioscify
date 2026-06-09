# Store Portal Copy Link & Auto-fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-store "Copy Link" button in the company portal and update the store portal to auto-fill the store slug and skip the store picker when a 3-segment URL (`/<company-slug>/<brand-slug>/<store-slug>`) is used.

**Architecture:** The company portal brand page gains a clipboard action button that constructs the full store portal URL from data already in scope. The store portal middleware is updated to capture an optional 3rd URL segment as `storeSlug`, forwarded as an `x-store-slug` header; the login page reads this header and passes it to `LoginForm` which pre-fills the slug input and skips the store picker on successful login.

**Tech Stack:** Next.js 15 App Router, TypeScript, lucide-react, sonner (toast), Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `kioscify-company/.env.local` | Add `NEXT_PUBLIC_STORE_PORTAL_BASE_URL` |
| `kioscify-company/app/(main)/brands/[brandId]/page.tsx` | Add `Copy` icon import + `copyStoreLink` handler + button in stores table |
| `kioskly-admin/middleware.ts` | Update regex to capture optional 3rd segment; pass `x-store-slug` header |
| `kioskly-admin/app/login/page.tsx` | Read `x-store-slug` header; pass `preSelectedStoreSlug` prop to `LoginForm` |
| `kioskly-admin/app/login/LoginForm.tsx` | Accept `preSelectedStoreSlug` prop; pre-fill state; handle already-logged-in + multi-store skip |

---

## Task 1: Add Store Portal Base URL env var to company portal

**Files:**
- Modify: `kioscify-company/.env.local`

- [ ] **Step 1: Add the env var**

Open `kioscify-company/.env.local` and append:

```env
NEXT_PUBLIC_STORE_PORTAL_BASE_URL=http://localhost:3000
```

The file already contains `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_PLATFORM_DOMAIN`. This new var tells the company portal where the store portal lives so the copy link points to the right domain.

- [ ] **Step 2: Verify .env.local is gitignored**

```bash
git check-ignore -v kioscify-company/.env.local
```

Expected: a line showing `.env.local` matched by a `.gitignore` rule. If not ignored, do NOT commit it.

- [ ] **Step 3: Commit**

```bash
git add kioscify-company/.env.local
git commit -m "chore(company): add NEXT_PUBLIC_STORE_PORTAL_BASE_URL env var"
```

---

## Task 2: Add Copy Link button to stores table in company portal

**Files:**
- Modify: `kioscify-company/app/(main)/brands/[brandId]/page.tsx`

**Context:** The stores table lives at line ~747 of this file. Each store row already has three action buttons: Truck (delivery platforms), QrCode (QR modal), and Edit. We add a 4th button — Copy — between QrCode and Edit. The QR button at line ~777 already references `brand?.company?.slug` and `brand?.slug`, confirming both are in scope via the `brand` state.

The `toast` import from `sonner` is already used elsewhere in this file. The `Copy` icon needs to be added to the existing lucide-react import.

- [ ] **Step 1: Add `Copy` to the lucide-react import**

Find this line near the top of the file (around line 7):

```ts
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, Save, QrCode, ChevronUp, ChevronDown, Truck, Star } from 'lucide-react';
```

Replace with:

```ts
import { Plus, Pencil, Trash2, X, ChevronLeft, Upload, Save, QrCode, ChevronUp, ChevronDown, Truck, Star, Copy } from 'lucide-react';
```

- [ ] **Step 2: Add `copyStoreLink` handler inside the component**

Add this function near the other handler functions (e.g. after `openDeliveryModal`). This is a standalone async function — no state needed:

```ts
const copyStoreLink = async (store: Store) => {
  const base = process.env.NEXT_PUBLIC_STORE_PORTAL_BASE_URL ?? '';
  const url = `${base}/${brand?.company?.slug ?? ''}/${brand?.slug ?? ''}/${store.slug}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const el = document.createElement('textarea');
    el.value = url;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
  toast.success('Store portal link copied!');
};
```

- [ ] **Step 3: Add the Copy button to the store row**

Find the store row actions `<div>` (around line 769):

```tsx
<div className="flex items-center justify-end gap-3">
  <button
    onClick={() => openDeliveryModal(store)}
    title="Delivery Platforms"
    className="text-gray-400 hover:text-orange-600 transition-colors"
  >
    <Truck className="w-4 h-4" />
  </button>
  <button
    onClick={() => setQrStore({
      storeName: store.name,
      companySlug: brand?.company?.slug ?? '',
      brandSlug: brand?.slug ?? '',
      storeSlug: store.slug,
    })}
    title="View QR Code"
    className="text-gray-400 hover:text-orange-600 transition-colors"
  >
    <QrCode className="w-4 h-4" />
  </button>
  {editingStoreId === store.id ? (
```

Insert the Copy button between QrCode and the edit block:

```tsx
<div className="flex items-center justify-end gap-3">
  <button
    onClick={() => openDeliveryModal(store)}
    title="Delivery Platforms"
    className="text-gray-400 hover:text-orange-600 transition-colors"
  >
    <Truck className="w-4 h-4" />
  </button>
  <button
    onClick={() => setQrStore({
      storeName: store.name,
      companySlug: brand?.company?.slug ?? '',
      brandSlug: brand?.slug ?? '',
      storeSlug: store.slug,
    })}
    title="View QR Code"
    className="text-gray-400 hover:text-orange-600 transition-colors"
  >
    <QrCode className="w-4 h-4" />
  </button>
  <button
    onClick={() => copyStoreLink(store)}
    title="Copy store portal link"
    className="text-gray-400 hover:text-orange-600 transition-colors"
  >
    <Copy className="w-4 h-4" />
  </button>
  {editingStoreId === store.id ? (
```

- [ ] **Step 4: Verify manually**

Start the company portal:
```bash
npm run company:dev
```

Navigate to a brand page → Stores tab. Confirm:
- A Copy icon appears in each store row between QrCode and Edit
- Clicking it shows a `"Store portal link copied!"` toast
- Pasting the clipboard gives `http://localhost:3000/<company-slug>/<brand-slug>/<store-slug>`

- [ ] **Step 5: Commit**

```bash
git add "kioscify-company/app/(main)/brands/[brandId]/page.tsx"
git commit -m "feat(company): add copy store portal link button per store row"
```

---

## Task 3: Update store portal middleware to capture optional storeSlug

**Files:**
- Modify: `kioskly-admin/middleware.ts`

**Context:** The current regex on line 25 is:
```
/^\/([a-z0-9-]+)\/([a-z0-9-]+)(\/.*)?$/
```
It captures `companySlug` (group 1), `brandSlug` (group 2), and optional `rest` (group 3). The destructure at line 32 is `const [, companySlug, brandSlug, rest] = match;`.

We add an optional 3rd named segment for `storeSlug` between `brandSlug` and `rest`. The regex uses a non-capturing group `(?:...)` so the capturing group numbering stays predictable.

- [ ] **Step 1: Update the regex and destructure**

Find lines 25 and 32:

```ts
const match = pathname.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)(\/.*)?$/);
```

```ts
const [, companySlug, brandSlug, rest] = match;
```

Replace them with:

```ts
const match = pathname.match(/^\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?(\/.*)?$/);
```

```ts
const [, companySlug, brandSlug, storeSlug, rest] = match;
```

- [ ] **Step 2: Set the `x-store-slug` header when storeSlug is present**

Find the section after validation (around line 52) where headers are set:

```ts
requestHeaders.set('x-company-slug', companySlug);
requestHeaders.set('x-brand-slug', brandSlug);
```

Replace with:

```ts
requestHeaders.set('x-company-slug', companySlug);
requestHeaders.set('x-brand-slug', brandSlug);
if (storeSlug) requestHeaders.set('x-store-slug', storeSlug);
```

- [ ] **Step 3: Verify 2-segment URLs still work**

Start the store portal:
```bash
npm run admin:dev
```

Open `http://localhost:3000/<company-slug>/<brand-slug>` (use real slugs from your dev data). Confirm:
- Redirected to the branded login page (not a 404 or generic login)
- No regression in existing behaviour

- [ ] **Step 4: Verify 3-segment URL reaches login page**

Open `http://localhost:3000/<company-slug>/<brand-slug>/<store-slug>` in the browser. Confirm:
- Redirected to the branded login page (not a 404)
- No error in the terminal/console

(The store slug pre-fill isn't wired yet — that's Task 5. Just confirm routing works.)

- [ ] **Step 5: Commit**

```bash
git add kioskly-admin/middleware.ts
git commit -m "feat(store-portal): capture optional store-slug in middleware and forward as x-store-slug header"
```

---

## Task 4: Pass preSelectedStoreSlug from login page to LoginForm

**Files:**
- Modify: `kioskly-admin/app/login/page.tsx`

**Context:** This is a Next.js server component. It already reads `x-company-slug` and `x-brand-slug` from `headers()` (next/headers) at lines 34–36. We add `x-store-slug` the same way and pass it as a new optional prop to `LoginForm`.

- [ ] **Step 1: Read the header and pass the prop**

The current file (lines 33–45):

```ts
export default async function LoginPage() {
  const headersList = await headers();
  const companySlug = headersList.get('x-company-slug');
  const brandSlug = headersList.get('x-brand-slug');

  // No subdomain context — show generic portal (company + brand slug entry)
  if (!companySlug || !brandSlug) {
    return <BrandSlugForm />;
  }

  const brand = await fetchBrandInfo(companySlug, brandSlug);
  return <LoginForm companySlug={companySlug} brandSlug={brandSlug} brand={brand} />;
}
```

Replace with:

```ts
export default async function LoginPage() {
  const headersList = await headers();
  const companySlug = headersList.get('x-company-slug');
  const brandSlug = headersList.get('x-brand-slug');
  const preSelectedStoreSlug = headersList.get('x-store-slug') ?? undefined;

  // No subdomain context — show generic portal (company + brand slug entry)
  if (!companySlug || !brandSlug) {
    return <BrandSlugForm />;
  }

  const brand = await fetchBrandInfo(companySlug, brandSlug);
  return (
    <LoginForm
      companySlug={companySlug}
      brandSlug={brandSlug}
      brand={brand}
      preSelectedStoreSlug={preSelectedStoreSlug}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kioskly-admin/app/login/page.tsx
git commit -m "feat(store-portal): forward x-store-slug header to LoginForm as preSelectedStoreSlug prop"
```

---

## Task 5: Update LoginForm to pre-fill, skip store picker, and handle already-logged-in

**Files:**
- Modify: `kioskly-admin/app/login/LoginForm.tsx`

**Context:** The current component signature (line 23–31):

```ts
export default function LoginForm({
  companySlug,
  brandSlug,
  brand,
}: {
  companySlug: string;
  brandSlug: string;
  brand: BrandInfo | null;
})
```

State and effects to change:
- Line 35: `useState("")` for storeSlug — initialize from prop instead
- Lines 43–50: the `useEffect` that checks token + loads remembered slug — extend for pre-selected slug
- Lines 93–100: the post-login multi-store routing — skip picker when pre-selected

- [ ] **Step 1: Accept `preSelectedStoreSlug` prop**

Update the function signature and storeSlug initial state:

```ts
export default function LoginForm({
  companySlug,
  brandSlug,
  brand,
  preSelectedStoreSlug,
}: {
  companySlug: string;
  brandSlug: string;
  brand: BrandInfo | null;
  preSelectedStoreSlug?: string;
}) {
  const router = useRouter();
  const { fetchTenantBySlug } = useTenant();
  const storeSlugKey = `kioscify_store_slug_${companySlug}_${brandSlug}`;
  const [storeSlug, setStoreSlug] = useState(preSelectedStoreSlug ?? "");
```

- [ ] **Step 2: Update the already-logged-in `useEffect`**

Find the current effect (lines 43–50):

```ts
useEffect(() => {
  if (api.getToken()) {
    router.replace('/dashboard');
    return;
  }
  const saved = localStorage.getItem(storeSlugKey);
  if (saved) { setStoreSlug(saved); setRememberedSlug(true); }
}, [router, storeSlugKey]);
```

Replace with:

```ts
useEffect(() => {
  if (api.getToken()) {
    if (preSelectedStoreSlug) {
      fetchTenantBySlug(preSelectedStoreSlug).then(() => router.replace('/dashboard'));
    } else {
      router.replace('/dashboard');
    }
    return;
  }
  if (!preSelectedStoreSlug) {
    const saved = localStorage.getItem(storeSlugKey);
    if (saved) { setStoreSlug(saved); setRememberedSlug(true); }
  }
}, [router, storeSlugKey, fetchTenantBySlug, preSelectedStoreSlug]);
```

The `!preSelectedStoreSlug` guard prevents the remembered localStorage slug from overwriting the URL-provided one.

- [ ] **Step 3: Skip store picker when pre-selected**

Find the post-login multi-store routing (lines 93–100):

```ts
const stores = (response as any).stores ?? [];
if (stores.length > 1) {
  sessionStorage.setItem("accessible_stores", JSON.stringify(stores));
  router.push("/store-picker");
  return;
}

router.push("/dashboard");
```

Replace with:

```ts
const stores = (response as any).stores ?? [];
if (stores.length > 1 && !preSelectedStoreSlug) {
  sessionStorage.setItem("accessible_stores", JSON.stringify(stores));
  router.push("/store-picker");
  return;
}

router.push("/dashboard");
```

The tenant is already loaded for the correct store because `fetchTenantBySlug(storeSlug)` is called at the start of `handleSubmit` using the pre-filled slug value. No additional API call needed.

- [ ] **Step 4: Verify manually — new login via store portal link**

Make sure both dev servers are running:
```bash
npm run company:dev   # port 3001
npm run admin:dev     # port 3000
```

Test flow:
1. In company portal, copy the store link for a known store
2. Paste the URL in a new private/incognito browser window
3. Confirm the store slug input is pre-filled on the login page
4. Log in with valid credentials
5. Confirm you land on `/dashboard` without seeing the store picker (even for a multi-store user)

- [ ] **Step 5: Verify manually — already-logged-in auto-switch**

1. Log in to the store portal normally (any store)
2. Open the copied URL for a *different* store in the same browser tab
3. Confirm the active store switches and you land on `/dashboard` for the new store

- [ ] **Step 6: Verify fallback — 2-segment URL unchanged**

Open `http://localhost:3000/<company-slug>/<brand-slug>` (no storeSlug). Confirm:
- Store slug input is empty
- Remembered slug from localStorage still auto-fills (if one exists)
- Store picker appears normally for multi-store users after login

- [ ] **Step 7: Commit**

```bash
git add kioskly-admin/app/login/LoginForm.tsx
git commit -m "feat(store-portal): pre-fill store slug from URL and skip store picker when pre-selected"
```
