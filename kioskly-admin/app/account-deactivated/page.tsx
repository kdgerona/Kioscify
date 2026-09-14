import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Store Deactivated — Kioscify',
  description: 'This store is no longer active.',
};

export default function AccountDeactivatedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <img src="/logo-full.png" alt="Kioscify" className="w-80 h-40 object-contain" />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">
            This store is no longer active
          </h1>
          <p className="text-gray-500">
            Contact{' '}
            <a href="mailto:support@kioscify.com" className="font-medium text-gray-700 underline">
              support@kioscify.com
            </a>{' '}
            for assistance.
          </p>
        </div>
      </div>
    </div>
  );
}
