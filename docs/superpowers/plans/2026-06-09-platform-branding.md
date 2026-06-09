# Platform Portal Branding & UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace indigo accent colors with Kioscify brand orange (`#ea580c`) and redesign login/change-password pages to use the modern split-screen layout matching kioscify-company and kioskly-admin portals.

**Architecture:** Add a `brand` Tailwind color token, port the split-screen page pattern from kioscify-company's `LoginForm.tsx` and store portal's `change-password/page.tsx` directly into the platform portal, then update the main layout's indigo references. No new dependencies needed.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS, Lucide React, TypeScript

**Dev server:** `npm run platform:dev` (port 3002) or via `http://platform.kioscify.localhost/`  
**Login credentials for verification:** username `kdev`, password `Kd@rk12345`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `kioscify-platform/tailwind.config.ts` | Modify | Add `brand` color token `#ea580c` |
| `kioscify-platform/lib/utils.ts` | Modify | Add `getContrastColor` utility |
| `kioscify-platform/app/login/page.tsx` | Rewrite | Split-screen login UI |
| `kioscify-platform/app/change-password/page.tsx` | Rewrite | Split-screen change-password UI |
| `kioscify-platform/app/(main)/layout.tsx` | Modify | Replace indigo → brand, larger logos |

---

## Task 1: Add brand color token to Tailwind config

**Files:**
- Modify: `kioscify-platform/tailwind.config.ts`

- [ ] **Step 1: Update tailwind.config.ts**

Replace the empty `theme.extend` with:

```ts
import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#ea580c",
        },
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-platform/tailwind.config.ts
git commit -m "feat(platform): add brand color token #ea580c to tailwind config"
```

---

## Task 2: Add getContrastColor utility

**Files:**
- Modify: `kioscify-platform/lib/utils.ts`

- [ ] **Step 1: Add getContrastColor to lib/utils.ts**

Append to the existing file (keep `formatUserName` and `formatRole` unchanged):

```ts
export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#111827' : '#ffffff';
}
```

- [ ] **Step 2: Commit**

```bash
git add kioscify-platform/lib/utils.ts
git commit -m "feat(platform): add getContrastColor utility"
```

---

## Task 3: Redesign login page with split-screen layout

**Files:**
- Rewrite: `kioscify-platform/app/login/page.tsx`

- [ ] **Step 1: Replace login page with split-screen layout**

Full replacement of `app/login/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { getContrastColor } from '@/lib/utils';

const PRIMARY = '#ea580c';
const panelText = getContrastColor(PRIMARY);
const panelMuted = 'rgba(255,255,255,0.7)';
const panelPillBg = 'rgba(255,255,255,0.18)';
const ringColor = 'white';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (api.getToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login({ username, password });
      if (data.mustChangePassword || data.user?.isFirstLogin || data.user?.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand identity */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden"
        style={{ backgroundColor: PRIMARY }}
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

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-full.png"
            alt="Kioscify"
            className="w-28 h-28 object-contain rounded-2xl mb-6 shadow-lg bg-white p-3"
          />
          <h1 className="text-3xl font-bold mb-2 drop-shadow" style={{ color: panelText }}>
            Kioscify
          </h1>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: panelMuted }}>
            Platform Administration — manage companies, stores, and users across Kioscify.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Companies', 'Stores', 'Users', 'Analytics'].map(f => (
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-full.png"
            alt="Kioscify"
            className="w-16 h-16 object-contain rounded-xl mb-3"
          />
          <h1 className="text-xl font-bold text-gray-900">Kioscify</h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to Platform Admin</p>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                  style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
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
              style={{ backgroundColor: PRIMARY, color: getContrastColor(PRIMARY) }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
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
```

- [ ] **Step 2: Verify in Chrome DevTools**

Navigate to `http://platform.kioscify.localhost/login`. Take a screenshot. Confirm:
- Split-screen visible on wide viewport (left orange panel, right white form)
- Logo visible at ~112px on left panel with white rounded background
- "Companies · Stores · Users · Analytics" pills
- Sign In button is orange

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/app/login/page.tsx
git commit -m "feat(platform): redesign login page with split-screen brand layout"
```

---

## Task 4: Redesign change-password page with split-screen layout

**Files:**
- Rewrite: `kioscify-platform/app/change-password/page.tsx`

- [ ] **Step 1: Replace change-password page with split-screen layout**

Full replacement of `app/change-password/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { getContrastColor } from '@/lib/utils';

const PRIMARY = '#ea580c';
const panelText = getContrastColor(PRIMARY);
const panelMuted = 'rgba(255,255,255,0.7)';
const panelPillBg = 'rgba(255,255,255,0.18)';
const ringColor = 'white';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api.getToken()) {
      router.replace('/login');
      return;
    }
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (!user.mustChangePassword && !user.isFirstLogin) {
        router.replace('/dashboard');
      }
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);

      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        user.isFirstLogin = false;
        user.mustChangePassword = false;
        localStorage.setItem('user', JSON.stringify(user));
      }

      router.push('/dashboard');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { label: 'Current / Temporary Password', val: currentPassword, set: setCurrentPassword, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
    { label: 'New Password', val: newPassword, set: setNewPassword, show: showNew, toggle: () => setShowNew(v => !v) },
    { label: 'Confirm New Password', val: confirmPassword, set: setConfirmPassword, show: showConfirm, toggle: () => setShowConfirm(v => !v) },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand identity */}
      <div
        className="hidden lg:flex lg:w-5/12 xl:w-1/2 relative flex-col items-center justify-center p-12 overflow-hidden"
        style={{ backgroundColor: PRIMARY }}
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

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-full.png"
            alt="Kioscify"
            className="w-28 h-28 object-contain rounded-2xl mb-6 shadow-lg bg-white p-3"
          />
          <h1 className="text-3xl font-bold mb-2 drop-shadow" style={{ color: panelText }}>
            Kioscify
          </h1>
          <p className="text-sm max-w-xs leading-relaxed" style={{ color: panelMuted }}>
            Platform Administration — manage companies, stores, and users across Kioscify.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['Companies', 'Stores', 'Users', 'Analytics'].map(f => (
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-full.png"
            alt="Kioscify"
            className="w-16 h-16 object-contain rounded-xl mb-3"
          />
          <h1 className="text-xl font-bold text-gray-900">Kioscify</h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-start gap-3">
            <div className="p-2.5 rounded-xl flex-shrink-0 bg-gray-100">
              <KeyRound className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Set New Password</h2>
              <p className="text-gray-500 text-sm mt-1">
                For security, set a new password before continuing.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {fields.map(({ label, val, set, show, toggle }) => (
              <div key={label}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    value={val}
                    onChange={e => set(e.target.value)}
                    required
                    className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition focus:ring-2 focus:border-transparent hover:border-gray-300 bg-white"
                    style={{ '--tw-ring-color': PRIMARY } as React.CSSProperties}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={toggle}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {label === 'New Password' && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Min 10 chars · uppercase · lowercase · number · special character
                  </p>
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:brightness-90 mt-2"
              style={{ backgroundColor: PRIMARY, color: getContrastColor(PRIMARY) }}
            >
              {loading ? 'Saving...' : 'Set New Password'}
            </button>

            <button
              type="button"
              onClick={() => api.logout()}
              className="w-full py-3 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
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
```

- [ ] **Step 2: Verify in Chrome DevTools**

To view this page, temporarily set `mustChangePassword: true` in localStorage via DevTools console:
```js
const u = JSON.parse(localStorage.getItem('user')); u.mustChangePassword = true; localStorage.setItem('user', JSON.stringify(u));
```
Then navigate to `http://platform.kioscify.localhost/change-password`. Take a screenshot. Confirm:
- Split-screen layout with orange left panel
- KeyRound icon + heading on right
- 3 password fields each with show/hide toggle
- Orange submit button + grey cancel button

Restore after: navigate to `/login` and log back in normally.

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/app/change-password/page.tsx
git commit -m "feat(platform): redesign change-password page with split-screen brand layout"
```

---

## Task 5: Update main layout — brand colors and logo sizes

**Files:**
- Modify: `kioscify-platform/app/(main)/layout.tsx`

- [ ] **Step 1: Replace indigo references and update logo sizes**

Make these targeted changes in `app/(main)/layout.tsx`:

1. Loading spinner — change `border-indigo-400` → `border-brand`:
```tsx
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto" />
```

2. Active nav item — change `bg-indigo-600` → `bg-brand`:
```tsx
isActive
  ? 'bg-brand text-white font-medium'
  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
```

3. Sidebar logo — change `w-7 h-7` → `w-9 h-9`:
```tsx
<img src="/logo.png" alt="Kioscify" className="w-9 h-9 object-contain rounded-lg" />
```

4. Mobile header logo — change `w-5 h-5` → `w-7 h-7`:
```tsx
<img src="/logo.png" alt="Kioscify" className="w-7 h-7 object-contain" />
```

- [ ] **Step 2: Verify in Chrome DevTools**

Navigate to `http://platform.kioscify.localhost/dashboard` (logged in). Take a screenshot. Confirm:
- "Dashboard" nav item has orange background (not indigo/purple)
- Sidebar logo visibly larger
- Navigate to another page and back — active state orange

- [ ] **Step 3: Commit**

```bash
git add kioscify-platform/app/(main)/layout.tsx
git commit -m "feat(platform): update sidebar to brand orange and increase logo sizes"
```
