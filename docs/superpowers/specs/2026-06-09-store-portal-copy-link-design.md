# Store Portal Copy Link & Auto-fill Design

## Context

Company admins need a fast way to share a direct store portal link with store staff. Currently, store admins must manually type their store slug on the login page. This feature adds a one-click copy button in the company portal and updates the store portal to auto-fill (and auto-skip the store picker) when a store-specific URL is opened.

---

## URL Format

```
/<company-slug>/<brand-slug>/<store-slug>
```

All three values are available in the company portal brand page context:
- `brand.company.slug` — company slug
- `brand.slug` — brand slug
- `store.slug` — store slug

---

## Part 1: Company Portal — Copy Link Button

**File:** `kioscify-company/app/(main)/brands/[brandId]/page.tsx`

Add a 4th icon button to each store row in the stores table. Existing row actions are: Truck, QR Code, Edit/Save.

**Button behaviour:**
- Copies `${process.env.NEXT_PUBLIC_STORE_PORTAL_BASE_URL}/${brand.company.slug}/${brand.slug}/${store.slug}` to clipboard
- Uses `navigator.clipboard.writeText()` (same pattern as `users/page.tsx:83-97`)
- On success: `toast.success("Store portal link copied!")`
- Icon: `Copy` from lucide-react (add to existing import list)
- Style: `text-gray-400 hover:text-orange-600 transition-colors` with `title="Copy store portal link"`

**New env var:** `NEXT_PUBLIC_STORE_PORTAL_BASE_URL`
- Add to `kioscify-company/.env.local` (e.g. `http://localhost:3000` in dev)

---

## Part 2: Store Portal — 3-Segment URL Support & Auto-fill

### 2a. Middleware (`kioskly-admin/middleware.ts`)

Update the path-matching regex to optionally capture a 3rd segment as `storeSlug`:

```
/^\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?(\/.*)?$/
```

Groups: `companySlug`, `brandSlug`, optional `storeSlug`, optional `rest`.

When `storeSlug` is captured, set `requestHeaders.set('x-store-slug', storeSlug)` alongside the existing `x-company-slug` and `x-brand-slug` headers. The rewrite target remains `rest || '/login'`.

### 2b. Login Page (`kioskly-admin/app/login/page.tsx`)

Read the new header and pass it down:

```ts
const storeSlug = headersList.get('x-store-slug');
// ...
return <LoginForm companySlug={companySlug} brandSlug={brandSlug} brand={brand} preSelectedStoreSlug={storeSlug ?? undefined} />;
```

### 2c. LoginForm (`kioskly-admin/app/login/LoginForm.tsx`)

Accept `preSelectedStoreSlug?: string` prop. Three targeted changes:

**1. Pre-fill store slug state:**
```ts
const [storeSlug, setStoreSlug] = useState(preSelectedStoreSlug ?? "");
```

**2. Already-logged-in case** — extend the existing `useEffect`:
```ts
if (api.getToken()) {
  if (preSelectedStoreSlug) {
    fetchTenantBySlug(preSelectedStoreSlug).then(() => router.replace('/dashboard'));
  } else {
    router.replace('/dashboard');
  }
  return;
}
```

**3. Post-login multi-store case** — after successful login, skip the store picker when a store is pre-selected:
```ts
const stores = (response as any).stores ?? [];
if (stores.length > 1 && !preSelectedStoreSlug) {
  sessionStorage.setItem("accessible_stores", JSON.stringify(stores));
  router.push("/store-picker");
  return;
}
router.push("/dashboard");
```

The tenant is already loaded via the existing `fetchTenantBySlug(storeSlug)` call earlier in `handleSubmit`, so no additional API call is needed to switch stores.

---

## Verification

1. **Company portal copy button:**
   - Open a brand page in the company portal
   - Click the Copy icon on any store row
   - Confirm the toast appears and the clipboard contains `<base-url>/<company-slug>/<brand-slug>/<store-slug>`

2. **Store portal pre-fill (not logged in):**
   - Open `http://localhost:3000/<company-slug>/<brand-slug>/<store-slug>`
   - Confirm the store slug input is pre-filled with the store slug
   - Log in — confirm you land on `/dashboard` without seeing the store picker (even for multi-store users)

3. **Store portal auto-switch (already logged in):**
   - While logged in to one store, open the URL for a different store
   - Confirm the active store switches and you land on `/dashboard` for the new store

4. **Fallback — 2-segment URL:**
   - Open `http://localhost:3000/<company-slug>/<brand-slug>` (no store slug)
   - Confirm the login page behaves exactly as before (store slug input is empty)
