"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { useTenant } from "@/contexts/TenantContext";

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

  // Pre-fill store slug from previous login
  useEffect(() => {
    const saved = localStorage.getItem(STORE_SLUG_KEY);
    if (saved) { setStoreSlug(saved); setRememberedSlug(true); }
  }, []);

  const primaryColor = brand?.themeColors?.primary || "#ea580c";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Resolve the store — validates slug and populates TenantContext + localStorage
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
        api.clearToken(); // clear token without redirecting — stay on login page to show error
        setLoading(false);
        return;
      }

      localStorage.setItem("user", JSON.stringify(response.user));
      // Persist portal slugs for post-logout redirect
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
    ? brand.logoUrl.startsWith("http")
      ? brand.logoUrl
      : `${apiBase}${brand.logoUrl}`
    : null;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: `linear-gradient(to bottom right, ${primaryColor}15, ${primaryColor}30)`,
      }}
    >
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          {logoSrc ? (
            <div className="flex justify-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt={brand!.name}
                className="w-24 h-24 object-contain rounded-xl"
              />
            </div>
          ) : (
            <div
              className="w-24 h-24 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: primaryColor }}
            >
              <span className="text-white text-3xl font-bold">
                {brand ? brand.name[0].toUpperCase() : "K"}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900 text-center">
            {brand ? brand.name : "Store Portal"}
          </h1>
          <p className="text-gray-500 text-sm mt-1">Store Management Portal</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Store ID / Slug
              </label>
              {rememberedSlug && (
                <button
                  type="button"
                  onClick={() => {
                    setStoreSlug("");
                    setRememberedSlug(false);
                    localStorage.removeItem(STORE_SLUG_KEY);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
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
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent outline-none text-sm text-gray-900 ${rememberedSlug ? 'bg-gray-50 border-gray-200 cursor-default' : 'border-gray-300'}`}
              style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
              placeholder="e.g. mr-lemon-branch-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none text-sm text-gray-900"
              style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 pr-11 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none text-sm text-gray-900"
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
            className="w-full text-black font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:brightness-90"
            style={{ backgroundColor: primaryColor }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by <span className="font-semibold">Kioscify</span>
        </p>
      </div>
    </div>
  );
}
