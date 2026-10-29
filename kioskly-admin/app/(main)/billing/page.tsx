"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { api } from "@/lib/api";
import { useBilling } from "@/contexts/BillingContext";
import { formatManilaDate, formatPeriod, formatPeso, PAYMENT_METHOD_LABELS } from "@/lib/billing-format";
import { PayNowModal } from "@/components/billing/PayNowModal";
import { Pagination } from "@/components/ui/pagination";
import { useLocalPagination } from "@/lib/use-pagination";
import type { BillingStatus, StoreInvoiceRow } from "@/types";

const STATUS_LABEL: Record<BillingStatus, string> = {
  EXEMPT: "No billing",
  NOT_ACTIVATED: "Not activated",
  TRIAL: "Trial",
  ACTIVE: "Active",
  DUE: "Due",
  LOCKED: "Locked",
};

const INVOICE_STATUS: Record<StoreInvoiceRow["status"], { label: string; className: string }> = {
  OPEN: { label: "Open", className: "bg-amber-50 text-amber-700" },
  PAID: { label: "Paid", className: "bg-green-50 text-green-700" },
  WAIVED: { label: "Waived", className: "bg-blue-50 text-blue-700" },
  VOID: { label: "Void", className: "bg-gray-100 text-gray-500" },
};

const NO_INVOICES: StoreInvoiceRow[] = [];

export default function BillingPage() {
  const { me, refresh } = useBilling();
  const [invoices, setInvoices] = useState<StoreInvoiceRow[] | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  // The API returns at most the latest 100 invoices (one a month), so it pages in the browser
  const pager = useLocalPagination(invoices ?? NO_INVOICES);

  const billed = !!me && !(me.status.status === "EXEMPT" && me.plan?.billingEnabled !== true);

  useEffect(() => {
    if (!billed) return;
    api.getMyInvoices().then(setInvoices).catch(() => setInvoices([]));
  }, [billed, me?.status.openInvoiceId, me?.status.status]);

  if (!me) {
    return <div className="p-8 text-sm text-gray-400">Loading…</div>;
  }

  if (!billed) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Billing</h1>
        <div className="bg-white rounded-lg border py-16 text-center text-gray-500">No billing for this store.</div>
      </div>
    );
  }

  const s = me.status;
  const upcoming = !!s.upcomingDueAt;
  const canPayNow = me.canPay && (s.status === "DUE" || s.status === "LOCKED" || upcoming || !!me.openInvoice);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl text-gray-900">
      <h1 className="text-2xl font-bold text-gray-900">Billing</h1>

      <div className="bg-white rounded-lg border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Kioscify subscription</p>
              <p className="text-xl font-semibold text-gray-900">
                {formatPeso(me.plan?.priceCentavos)} <span className="text-sm font-normal text-gray-500">/ month</span>
              </p>
            </div>
          </div>
          <span className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">{STATUS_LABEL[s.status]}</span>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <Item label="Trial ends" value={formatManilaDate(me.plan?.trialEndsAt)} />
          <Item label="Paid through" value={formatManilaDate(me.plan?.paidThroughAt)} />
          {/* In the reminder window the invoice already exists, so plan.nextBillingAt has moved on a month. */}
          <Item label="Next billing" value={formatManilaDate(s.upcomingDueAt ?? me.plan?.nextBillingAt)} />
          <Item label="Amount due" value={s.status === "DUE" || s.status === "LOCKED" || upcoming ? formatPeso(s.amountCentavos) : "—"} />
        </dl>

        {/* The trial notice points here, and this page already shows when the trial ends */}
        {me.storeView.variant !== "none" && me.storeView.variant !== "trial" && (
          <p className="mt-4 text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">{me.storeView.body}</p>
        )}

        {canPayNow && (
          <button
            onClick={() => setPayOpen(true)}
            className="mt-4 min-h-[44px] px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold shadow-sm hover:bg-red-700 touch-manipulation"
          >
            Pay now{me.openInvoice ? ` · ${formatPeso(me.openInvoice.amountCentavos)}` : ""}
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Billing history</h2>
        </div>
        {invoices === null ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No invoices yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide text-left">
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y text-gray-900">
                {pager.pageItems.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{formatPeriod(inv.periodStart, inv.periodEnd)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPeso(inv.amountCentavos)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatManilaDate(inv.dueAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INVOICE_STATUS[inv.status].className}`}>
                        {INVOICE_STATUS[inv.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatManilaDate(inv.paidAt)}</td>
                    <td className="px-4 py-3">{inv.paymentMethod ? PAYMENT_METHOD_LABELS[inv.paymentMethod] : "—"}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[12rem] break-words">{inv.reference ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {inv.status === "PAID" && (
                        <Link href={`/billing/receipts/${inv.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                          Receipt
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!invoices?.length && (
          <div className="px-4 pb-4 border-t">
            <Pagination
              page={pager.page}
              totalPages={pager.totalPages}
              total={pager.total}
              pageSize={pager.pageSize}
              onPageChange={pager.setPage}
              onPageSizeChange={pager.setPageSize}
            />
          </div>
        )}
      </div>

      <PayNowModal open={payOpen} onClose={() => { setPayOpen(false); refresh(); }} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}
