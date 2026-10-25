'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { formatManilaDate, formatPeso } from '@/lib/money';
import type { PaymentsLogRow } from '@/types';
import { METHOD_LABELS, SOURCE_LABELS, manualMethodLabel } from './labels';

/** Cross-store payments log with CSV export. */
export function PaymentsLog() {
  const [rows, setRows] = useState<PaymentsLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPaymentsLog({ page, limit: 50 });
      setRows(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load payments'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await api.downloadPaymentsCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kioscify-payments-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={exportCsv}
          disabled={exporting}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      <div className="bg-white rounded-lg border overflow-x-auto">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">No payments yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatManilaDate(r.paidAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.storeName ?? '—'}</p>
                    <p className="text-xs text-gray-400">{[r.companyName, r.brandName].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.invoiceNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatPeso(r.amountCentavos)}
                    {r.flagged && <span className="ml-1 text-xs text-red-600" title="Not applied — check for a refund">⚑</span>}
                    {r.amountMismatch && <span className="ml-1 text-xs text-amber-600" title="Applied, but the amount differs from the invoice">≠</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {METHOD_LABELS[r.method]}
                    {r.manualMethod ? ` · ${manualMethodLabel(r.manualMethod)}` : ''}
                    <p className="text-xs text-gray-400">{SOURCE_LABELS[r.source]}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.reference ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 text-sm">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border rounded-md disabled:opacity-50">Previous</button>
          <span className="px-3 py-1.5 text-gray-500">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 border rounded-md disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
