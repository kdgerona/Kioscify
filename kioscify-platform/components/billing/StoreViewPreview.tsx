import type { StoreView } from '@/types';
import { AlertTriangle, Lock, Sparkles } from 'lucide-react';

function ViewCard({ heading, view }: { heading: string; view: StoreView }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{heading}</p>
      {view.variant === 'none' ? (
        <div className="rounded-md border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
          Nothing shown — the app looks exactly as today.
        </div>
      ) : (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            view.variant === 'lock'
              ? 'bg-red-50 border border-red-200 text-red-800'
              : view.variant === 'trial'
                ? 'bg-blue-50 border border-blue-200 text-blue-900'
                : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            {view.variant === 'lock' ? <Lock className="w-4 h-4" /> : view.variant === 'trial' ? <Sparkles className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {view.title}
            {view.variant === 'lock' && <span className="text-xs font-normal">(full-screen lock)</span>}
            {view.variant === 'trial' && <span className="text-xs font-normal">(closable)</span>}
          </div>
          <p className="mt-1">{view.body}</p>
          {view.showPayAction && (
            <span className="inline-block mt-2 px-3 py-1 rounded bg-gray-900 text-white text-xs font-medium">Pay now</span>
          )}
        </div>
      )}
    </div>
  );
}

export function StoreViewPreview({ admin, cashier }: { admin: StoreView; cashier: StoreView }) {
  return (
    <div className="flex flex-col md:flex-row gap-4">
      <ViewCard heading="Store admin sees" view={admin} />
      <ViewCard heading="Cashier sees" view={cashier} />
    </div>
  );
}
