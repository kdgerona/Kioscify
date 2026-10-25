import type { BillingAuditEntry } from '@/types';

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

export function AuditLogList({ entries }: { entries: BillingAuditEntry[] }) {
  if (entries.length === 0) {
    return <div className="py-10 text-center text-sm text-gray-400">No billing changes recorded yet.</div>;
  }
  return (
    <ul className="divide-y">
      {entries.map(e => {
        const keys = Object.keys(e.after ?? e.before ?? {});
        return (
          <li key={e.id} className="py-3">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-mono">{e.action}</span>
              <span>
                {new Date(e.createdAt).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}
                {' · '}
                {e.actorUserId ? (e.actorName ?? 'Unknown user') : 'system'}
              </span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {keys.map(k => (
                <li key={k} className="text-sm text-gray-700">
                  <span className="text-gray-500">{k}:</span> {show(e.before?.[k])} → <span className="font-medium">{show(e.after?.[k])}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
