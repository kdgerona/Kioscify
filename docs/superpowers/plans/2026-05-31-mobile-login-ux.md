# Mobile App Login UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix manual entry to ask for company + brand + store slugs, persist all three across restarts, redesign the login screen with a branded background and inline "Change Store" flow.

**Architecture:** Three focused file changes in `kioskly-app/`. TenantContext gets a smarter `loadStoredTenant` that reads all stored slugs and passes them on startup. The tenant-setup screen grows two new input fields. The login screen (`index.tsx`) is rewritten with a full-screen brand-colored background, decorative geometric rings, a floating white card, and an inline card-swap for "Change Store".

**Tech Stack:** React Native 0.81.5, Expo SDK 54, NativeWind v2, `expo-camera` (already installed), React hooks, AsyncStorage.

**Spec:** `docs/superpowers/specs/2026-05-31-mobile-login-ux-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `kioskly-app/contexts/TenantContext.tsx` | Modify | Fix `loadStoredTenant` to pass stored company+brand slugs on startup |
| `kioskly-app/app/tenant-setup.tsx` | Modify | Add Company Slug + Brand Slug input fields to manual entry |
| `kioskly-app/app/index.tsx` | Modify (full rewrite) | Branded background, geometric rings, white card, inline Change Store |

---

## Task 1: Fix `loadStoredTenant` — pass stored slugs on startup

**Files:**
- Modify: `kioskly-app/contexts/TenantContext.tsx`

`loadStoredTenant` currently calls `fetchTenantBySlug(storedSlug)` with no company/brand context, meaning app restarts always do a global slug lookup. Fix: read all three stored keys together and pass the slugs as options.

- [ ] **Step 1: Replace `loadStoredTenant`**

Find this exact block (lines 157–168):
```typescript
  const loadStoredTenant = useCallback(async () => {
    try {
      const storedSlug = await AsyncStorage.getItem(TENANT_SLUG_KEY);
      if (storedSlug) {
        await fetchTenantBySlug(storedSlug);
      }
    } catch (err) {
      console.error("Failed to load stored tenant:", err);
    } finally {
      setInitializing(false);
    }
  }, [fetchTenantBySlug]);
```

Replace with:
```typescript
  const loadStoredTenant = useCallback(async () => {
    try {
      const [[, storedSlug], [, storedBrand], [, storedCompany]] =
        await AsyncStorage.multiGet([TENANT_SLUG_KEY, BRAND_DATA_KEY, COMPANY_DATA_KEY]);
      if (storedSlug) {
        const brandData = storedBrand ? JSON.parse(storedBrand) : null;
        const companyData = storedCompany ? JSON.parse(storedCompany) : null;
        await fetchTenantBySlug(storedSlug, {
          companySlug: companyData?.slug,
          brandSlug: brandData?.slug,
        });
      }
    } catch (err) {
      console.error("Failed to load stored tenant:", err);
    } finally {
      setInitializing(false);
    }
  }, [fetchTenantBySlug]);
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioskly-app && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors (pre-existing errors in unrelated files are acceptable).

- [ ] **Step 3: Commit**

```bash
git add kioskly-app/contexts/TenantContext.tsx
git commit -m "fix(app): pass stored company+brand slugs when reloading tenant on startup"
```

---

## Task 2: Tenant setup — add Company Slug + Brand Slug fields

**Files:**
- Modify: `kioskly-app/app/tenant-setup.tsx`

Add two new state variables for company slug and brand slug, update `handleContinue` to pass them, and add the two new input fields above the Store ID field.

- [ ] **Step 1: Add state variables**

Find this block (around line 26):
```typescript
  const [slug, setSlug] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
```

Replace with:
```typescript
  const [companySlug, setCompanySlug] = useState("");
  const [brandSlug, setBrandSlug] = useState("");
  const [slug, setSlug] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
```

- [ ] **Step 2: Update `handleContinue`**

Find this exact block (around line 33):
```typescript
  const handleContinue = async () => {
    if (!slug.trim()) return;
    try {
      await fetchTenantBySlug(slug.trim().toLowerCase());
      router.replace("/");
    } catch (err) {
      console.error("Failed to fetch tenant:", err);
    }
  };
```

Replace with:
```typescript
  const handleContinue = async () => {
    if (!companySlug.trim() || !brandSlug.trim() || !slug.trim()) return;
    try {
      await fetchTenantBySlug(slug.trim().toLowerCase(), {
        companySlug: companySlug.trim().toLowerCase(),
        brandSlug: brandSlug.trim().toLowerCase(),
      });
      router.replace("/");
    } catch (err) {
      console.error("Failed to fetch tenant:", err);
    }
  };
```

- [ ] **Step 3: Add Company Slug + Brand Slug input fields**

Find the `<View className="mb-6">` block that contains the "Store ID / Slug" label and TextInput (around line 158). Replace just the label text `Store ID / Slug` → `Store ID`, and add the two new field Views **before** it. The full replacement for that section of the form looks like:

```tsx
          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              Company Slug
            </Text>
            <TextInput
              className="w-full bg-gray-100 rounded-lg px-4 py-3 text-base"
              placeholder="e.g., your-company"
              value={companySlug}
              onChangeText={setCompanySlug}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              Brand Slug
            </Text>
            <TextInput
              className="w-full bg-gray-100 rounded-lg px-4 py-3 text-base"
              placeholder="e.g., your-brand"
              value={brandSlug}
              onChangeText={setBrandSlug}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View className="mb-6">
            <Text className="text-sm font-semibold text-gray-700 mb-2">
              Store ID
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
          </View>
```

Keep all other attributes of the Store ID TextInput unchanged (the `/>` closing and `</View>` closing are already in the file — do not duplicate them).

- [ ] **Step 4: Update the Continue button disabled condition**

Find:
```tsx
            disabled={loading || !slug.trim()}
```

Replace with:
```tsx
            disabled={loading || !slug.trim() || !companySlug.trim() || !brandSlug.trim()}
```

Also find the `className` conditional on the Continue button:
```tsx
            className={`w-full rounded-lg py-3 items-center ${
              loading || !slug.trim() ? "bg-gray-300" : "bg-orange-500"
            }`}
```

Replace with:
```tsx
            className={`w-full rounded-lg py-3 items-center ${
              loading || !slug.trim() || !companySlug.trim() || !brandSlug.trim() ? "bg-gray-300" : "bg-orange-500"
            }`}
```

- [ ] **Step 5: Update the hint text**

Find:
```tsx
            <Text className="text-xs text-gray-500 mt-1">
              Ask your administrator for your store identifier
            </Text>
```

Replace with:
```tsx
            <Text className="text-xs text-gray-500 mt-1">
              These are provided by your Kioscify platform administrator.
            </Text>
```

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioskly-app && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add kioskly-app/app/tenant-setup.tsx
git commit -m "feat(app): add company and brand slug fields to tenant setup manual entry"
```

---

## Task 3: Redesign login screen — branded background + inline Change Store

**Files:**
- Modify: `kioskly-app/app/index.tsx`

Full rewrite. The login screen becomes a branded full-screen background (brand primary color) with decorative geometric rings, a white floating card for the form, and an inline card-swap for "Change Store". The existing auth logic (`handleLogin`, redirects) is preserved unchanged.

- [ ] **Step 1: Replace the entire content of `kioskly-app/app/index.tsx`**

Write this exact file:

```tsx
import {
  View,
  Image,
  TextInput,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useState, useEffect } from "react";
import { useRouter, Href } from "expo-router";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import LogoWithAppName from "../assets/images/logo-with-appname.png";
import KioscifyLogo from "../assets/images/logo-only.png";
import { Ionicons } from "@expo/vector-icons";

export default function Index() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "change-store">("login");
  const [newStoreSlug, setNewStoreSlug] = useState("");
  const [changeStoreLoading, setChangeStoreLoading] = useState(false);
  const [changeStoreError, setChangeStoreError] = useState("");

  const router = useRouter();
  const { tenant, brand, company, clearTenant, fetchTenantBySlug, initializing: tenantInitializing } = useTenant();
  const { user, login, loading, error, clearError, initializing: authInitializing } = useAuth();

  useEffect(() => {
    if (tenantInitializing || authInitializing) return;
    if (!tenant) {
      const timer = setTimeout(() => { router.replace("/tenant-setup" as Href); }, 0);
      return () => clearTimeout(timer);
    }
    if (tenant && user) {
      const timer = setTimeout(() => { router.replace("/home" as Href); }, 0);
      return () => clearTimeout(timer);
    }
  }, [tenant, user, tenantInitializing, authInitializing, router]);

  useEffect(() => {
    if (error) clearError();
  }, [username, password]);

  const handleLogin = async () => {
    if (!tenant?.id) {
      Alert.alert("Error", "No tenant selected. Please restart the app.");
      return;
    }
    if (!username.trim()) {
      Alert.alert("Validation Error", "Please enter your username");
      return;
    }
    if (!password.trim()) {
      Alert.alert("Validation Error", "Please enter your password");
      return;
    }
    try {
      await login(username, password, tenant.slug);
      const storesRaw = await (
        await import("@react-native-async-storage/async-storage")
      ).default.getItem("@kioscify:accessible_stores");
      const stores = storesRaw ? JSON.parse(storesRaw) : [];
      if (stores.length > 1) {
        router.replace("/store-picker" as Href);
        return;
      }
      router.replace("/home");
    } catch {
      Alert.alert("Login Failed", error || "Invalid credentials. Please try again.");
    }
  };

  const handleChangeStore = async () => {
    if (!newStoreSlug.trim()) return;
    setChangeStoreLoading(true);
    setChangeStoreError("");
    try {
      await fetchTenantBySlug(newStoreSlug.trim().toLowerCase(), {
        companySlug: company?.slug,
        brandSlug: brand?.slug,
      });
      setMode("login");
      setNewStoreSlug("");
    } catch {
      setChangeStoreError("Store not found. Please check the Store ID.");
    } finally {
      setChangeStoreLoading(false);
    }
  };

  const handleChangeCompanyBrand = async () => {
    await clearTenant();
    router.replace("/tenant-setup" as Href);
  };

  if (tenantInitializing || authInitializing) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#ea580c" />
        <Text style={{ marginTop: 16, color: "#4b5563" }}>Loading...</Text>
      </View>
    );
  }

  if (!tenant) return null;

  const primaryColor =
    brand?.themeColors?.primary ?? tenant.themeColors?.primary ?? "#ea580c";
  const apiBase =
    process.env.EXPO_PUBLIC_API_URL?.replace("/api/v1", "") ||
    "http://localhost:3000";
  const rawLogoUri = company?.logoUrl ?? brand?.logoUrl ?? tenant?.logoUrl ?? null;
  const resolvedLogoUri = rawLogoUri
    ? rawLogoUri.startsWith("http")
      ? rawLogoUri
      : `${apiBase}${rawLogoUri}`
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: primaryColor }}>
      {/* Decorative rings — match web Store Portal left panel geometry */}
      <View
        style={{
          position: "absolute", top: -96, left: -96,
          width: 384, height: 384, borderRadius: 192,
          borderWidth: 40, borderColor: "white", opacity: 0.1,
        }}
      />
      <View
        style={{
          position: "absolute", bottom: -128, right: -128,
          width: 448, height: 448, borderRadius: 224,
          borderWidth: 50, borderColor: "white", opacity: 0.1,
        }}
      />
      <View
        style={{
          position: "absolute", top: "45%", right: -64,
          width: 256, height: 256, borderRadius: 128,
          borderWidth: 30, borderColor: "white", opacity: 0.07,
        }}
      />
      <View
        style={{
          position: "absolute", bottom: 96, left: 32,
          width: 128, height: 128, borderRadius: 64,
          backgroundColor: "white", opacity: 0.1,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
            paddingVertical: 48,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View
            style={{
              width: 96, height: 96, backgroundColor: "white",
              borderRadius: 20, alignItems: "center", justifyContent: "center",
              marginBottom: 12,
              shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 }, elevation: 6,
            }}
          >
            {resolvedLogoUri ? (
              <Image
                source={{ uri: resolvedLogoUri }}
                style={{ width: 72, height: 72 }}
                resizeMode="contain"
              />
            ) : (
              <Image
                source={LogoWithAppName}
                style={{ width: 72, height: 72 }}
                resizeMode="contain"
              />
            )}
          </View>

          <Text
            style={{
              color: "white", fontSize: 18, fontWeight: "700",
              marginBottom: 24, textAlign: "center",
            }}
          >
            {tenant.name}
          </Text>

          {/* White card */}
          <View
            style={{
              width: "100%", maxWidth: 400, backgroundColor: "white",
              borderRadius: 24, padding: 24,
              shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20,
              shadowOffset: { width: 0, height: 8 }, elevation: 8,
            }}
          >
            {mode === "login" ? (
              <>
                <Text
                  style={{ fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 20 }}
                >
                  Welcome back
                </Text>

                {error ? (
                  <View
                    style={{
                      backgroundColor: "#fef2f2", borderWidth: 1,
                      borderColor: "#fecaca", borderRadius: 10,
                      padding: 12, marginBottom: 16,
                    }}
                  >
                    <Text style={{ color: "#dc2626", fontSize: 13 }}>{error}</Text>
                  </View>
                ) : null}

                <View style={{ marginBottom: 16 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}
                  >
                    Username
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: "#f9fafb", borderWidth: 1,
                      borderColor: "#e5e7eb", borderRadius: 12,
                      paddingHorizontal: 16, paddingVertical: 12,
                      fontSize: 15, color: "#111827",
                    }}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    editable={!loading}
                  />
                </View>

                <View style={{ marginBottom: 24 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}
                  >
                    Password
                  </Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      style={{
                        backgroundColor: "#f9fafb", borderWidth: 1,
                        borderColor: "#e5e7eb", borderRadius: 12,
                        paddingHorizontal: 16, paddingVertical: 12,
                        paddingRight: 48, fontSize: 15, color: "#111827",
                      }}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      editable={!loading}
                      onSubmitEditing={handleLogin}
                    />
                    <TouchableOpacity
                      style={{
                        position: "absolute", right: 14,
                        top: 0, bottom: 0, justifyContent: "center",
                      }}
                      onPress={() => setShowPassword(!showPassword)}
                      disabled={loading}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off" : "eye"}
                        size={20}
                        color="#9ca3af"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={{
                    backgroundColor: loading ? "#9ca3af" : primaryColor,
                    borderRadius: 12, paddingVertical: 14, alignItems: "center",
                  }}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>
                      Sign In
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 }}
                >
                  Change Store
                </Text>
                <Text style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
                  Enter a store ID within {brand?.name ?? "your brand"}
                </Text>

                {changeStoreError ? (
                  <View
                    style={{
                      backgroundColor: "#fef2f2", borderWidth: 1,
                      borderColor: "#fecaca", borderRadius: 10,
                      padding: 12, marginBottom: 16,
                    }}
                  >
                    <Text style={{ color: "#dc2626", fontSize: 13 }}>
                      {changeStoreError}
                    </Text>
                  </View>
                ) : null}

                <View style={{ marginBottom: 20 }}>
                  <Text
                    style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 }}
                  >
                    Store ID
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: "#f9fafb", borderWidth: 1,
                      borderColor: "#e5e7eb", borderRadius: 12,
                      paddingHorizontal: 16, paddingVertical: 12,
                      fontSize: 15, color: "#111827",
                    }}
                    value={newStoreSlug}
                    onChangeText={setNewStoreSlug}
                    placeholder={tenant?.slug ?? "store-id"}
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!changeStoreLoading}
                    onSubmitEditing={handleChangeStore}
                  />
                </View>

                <TouchableOpacity
                  style={{
                    backgroundColor:
                      changeStoreLoading || !newStoreSlug.trim()
                        ? "#9ca3af"
                        : primaryColor,
                    borderRadius: 12, paddingVertical: 14,
                    alignItems: "center", marginBottom: 12,
                  }}
                  onPress={handleChangeStore}
                  disabled={changeStoreLoading || !newStoreSlug.trim()}
                >
                  {changeStoreLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>
                      Confirm
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ alignItems: "center", paddingVertical: 8 }}
                  onPress={() => {
                    setMode("login");
                    setNewStoreSlug("");
                    setChangeStoreError("");
                  }}
                >
                  <Text style={{ color: "#6b7280", fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Below-card actions — only visible in login mode */}
          {mode === "login" && (
            <>
              <TouchableOpacity
                style={{ marginTop: 20, paddingVertical: 8 }}
                onPress={() => { setMode("change-store"); setChangeStoreError(""); }}
                disabled={loading}
              >
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 14 }}>
                  Change Store
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ marginTop: 8, paddingVertical: 4 }}
                onPress={handleChangeCompanyBrand}
                disabled={loading}
              >
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                  Change Company / Brand
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Powered by Kioscify */}
          <View
            style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              marginTop: 32, backgroundColor: "rgba(255,255,255,0.15)",
              borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
            }}
          >
            <Image
              source={KioscifyLogo}
              style={{ width: 24, height: 24 }}
              resizeMode="contain"
            />
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
              Powered by{" "}
              <Text style={{ fontWeight: "700" }}>Kioscify</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioskly-app && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Verify app starts**

```bash
cd /Users/kevindavegerona/KDFiles/personal/projects/kioskly/kioskly-app && npm start -- --reset-cache
```

Expected: Expo dev server starts without TypeScript/bundler errors. On the emulator/device, the login screen shows the brand's primary color background with rings visible behind the white card.

- [ ] **Step 4: Commit**

```bash
git add kioskly-app/app/index.tsx
git commit -m "feat(app): redesign login screen with branded background and inline change store"
```

---

## Task 4: End-to-end verification

- [ ] **Step 1: First-time setup via manual entry**

Clear app storage (uninstall/reinstall or clear app data). Open app → tenant-setup screen shows three fields (Company Slug, Brand Slug, Store ID) + Scan QR Code button. Fill all three → Continue → login screen shows with correct brand color background and logo.

- [ ] **Step 2: App restart — no setup screen**

Force-close and reopen the app. Expected: goes straight to login screen (no tenant-setup), brand color background preserved.

- [ ] **Step 3: Change Store inline flow**

On login screen → tap "Change Store" (below card) → card swaps to Change Store form showing "Enter a store ID within [brand name]". Enter a valid store ID for a different store under the same brand → Confirm → card swaps back to login with updated store name. Enter an invalid slug → error shown in card.

- [ ] **Step 4: Cancel Change Store**

Tap "Change Store" → card swaps → tap "Cancel" → card swaps back to login form, username/password preserved.

- [ ] **Step 5: Change Company / Brand**

Tap "Change Company / Brand" (small link below card) → navigates to tenant-setup showing all three fields (full reset — storage cleared).

- [ ] **Step 6: QR scan path**

Scan a valid QR → straight to login screen. Confirm correct store branding shown. No tenant-setup screen shown.

- [ ] **Step 7: Final push**

```bash
git push origin feat/new-business-model
```
