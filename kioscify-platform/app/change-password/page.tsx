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
            {['Companies', 'Stores', 'Users'].map(f => (
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
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {label === 'New Password' && (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Minimum 10 characters
                  </p>
                )}
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-semibold py-3 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm hover:brightness-90 mt-2"
              style={{ backgroundColor: PRIMARY, color: panelText }}
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

        </div>
      </div>
    </div>
  );
}
