import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Under Maintenance — Kioscify',
  description: 'Kioscify Company Portal is currently under maintenance.',
};

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <img src="/logo-full.png" alt="Kioscify" className="w-80 h-40 object-contain" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">
            We&apos;re currently under maintenance
          </h1>
          <p className="text-gray-500">
            We&apos;ll be back shortly. Thank you for your patience.
          </p>
        </div>
      </div>
    </div>
  );
}
