"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Store } from "lucide-react";
import { api } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";
import { getContrastColor } from "@/lib/utils";

const PORTAL_COMPANY_KEY = "kioscify_portal_company_slug";
const PORTAL_BRAND_KEY = "kioscify_portal_brand_slug";
const STORE_SLUG_KEY = "kioscify_store_slug";

interface BrandInfo {
  name: string;
  logoUrl: string | null;
  themeColors: {
    primary?: string;
    secondary?: string;
    accent?: string;
  } | null;
}

export default function LoginForm({
  companySlug,
  brandSlug,
  brand,
}: {
  companySlug: string;
  brandSlug: string;
  brand: BrandInfo | null;
}) {
  const router = useRouter();
  const { fetchTenantBySlug } = useTenant();
  const [storeSlug, setStoreSlug] = useState("");
  const [rememberedSlug, setRememberedSlug] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORE_SLUG_KEY);
    if (saved) { setStoreSlug(saved); setRememberedSlug(true); }
  }, []);

  const primaryColor    = brand?.themeColors?.primary || "#ea580c";
  // On the white right panel, only use primaryColor as a text/link color if it's dark enough to read on white.
  const rightPanelAccent = getContrastColor(primaryColor) === "#111827" ? "#374151" : primaryColor;
  const panelText   = getContrastColor(primaryColor);
  const panelMuted  = panelText === "#ffffff" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.55)";
  const panelPillBg = panelText === "#ffffff" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)";
  const ringColor   = panelText === "#ffffff" ? "white" : "#111827";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await fetchTenantBySlug(storeSlug.trim().toLowerCase());

      const response = await api.login({
        username,
        password,
        storeSlug: storeSlug.trim().toLowerCase(),
        companySlug,
      });

      const allowedRoles = ["STORE_ADMIN", "ADMIN"];
      if (!allowedRoles.includes(response.user.role)) {
        setError("Access denied. Store Admin access required.");
        api.clearToken();
        setLoading(false);
        return;
      }

      localStorage.setItem("user", JSON.stringify(response.user));
      if (companySlug) localStorage.setItem(PORTAL_COMPANY_KEY, companySlug);
      if (brandSlug) localStorage.setItem(PORTAL_BRAND_KEY, brandSlug);

      if ((response as any).mustChangePassword || response.user.isFirstLogin) {
        router.push("/change-password");
        return;
      }

      const stores = (response as any).stores ?? [];
      if (stores.length > 1) {
        sessionStorage.setItem("accessible_stores", JSON.stringify(stores));
        router.push("/store-picker");
        return;
      }

      router.push("/dashboard");
    } catch (err: any) {
      if (
        err.message?.includes("Store not found") ||
        err.message?.includes("check the Store ID")
      ) {
        setError("Store not found. Please check the Store ID and try again.");
      } else {
        setError(
          err.response?.data?.message ||
            "Login failed. Please check your credentials.",
        );
      }
      setLoading(false);
    }
  };

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
    "http://localhost:3000";
  const logoSrc = brand?.logoUrl
    ? (() => { try { const path = brand.logoUrl!.startsWith('http') ? new URL(brand.logoUrl!).pathname : brand.logoUrl!; return `${apiBase}${path}`; } catch { return brand.logoUrl; } })()
    : null;

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand identity */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden"
        style={{ backgroundColor: primaryColor }}
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
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoSrc}
              alt={brand!.name}
              className="w-28 h-28 object-contain rounded-2xl mb-6 shadow-lg bg-white p-3"
            />
          ) : (
            <div className="w-28 h-28 rounded-2xl flex items-center justify-center mb-6 shadow-lg bg-white">
              <Store className="w-14 h-14" style={{ color: primaryColor }} />
            </div>
          )}

          <h1 className="text-3xl font-bold mb-2 drop-shadow" style={{ color: panelText }}>
            {brand?.name ?? "Store Portal"}
          </h1>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: panelMuted }}>
            Manage your store, track sales, and monitor your business — all in one place.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {["Sales", "Inventory", "Reports", "Expenses"].map((f) => (
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
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoSrc}
              alt={brand!.name}
              className="w-16 h-16 object-contain rounded-xl mb-3"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center mb-3"
              style={{ backgroundColor: primaryColor }}
            >
              <Store className="w-8 h-8 text-white" />
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">
            {brand?.name ?? "Store Portal"}
          </h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your store account</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Store ID
                </label>
                {rememberedSlug && (
                  <button
                    type="button"
                    onClick={() => {
                      setStoreSlug("");
                      setRememberedSlug(false);
                      localStorage.removeItem(STORE_SLUG_KEY);
                    }}
                    className="text-xs font-medium hover:underline"
                    style={{ color: rightPanelAccent }}
                  >
                    Change Store
                  </button>
                )}
              </div>
              <input
                type="text"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value)}
                required
                readOnly={rememberedSlug}
                autoCapitalize="none"
                autoCorrect="off"
                className={`w-full px-4 py-3 border rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent ${
                  rememberedSlug
                    ? "bg-gray-50 border-gray-200 cursor-default"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                placeholder="e.g. your-branch"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
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
              style={{ backgroundColor: primaryColor, color: getContrastColor(primaryColor) }}
            >
              {loading ? "Signing in..." : "Sign In"}
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
