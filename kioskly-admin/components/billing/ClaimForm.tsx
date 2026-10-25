"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import { pesoToCentavos } from "@/lib/billing-format";
import { useBilling } from "@/contexts/BillingContext";

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#ea580c)]";

function todayManila(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** "I've paid" for payments to the fallback bank QR — Kioscify confirms it manually. */
export function ClaimForm({ invoiceId, amountCentavos }: { invoiceId: string; amountCentavos: number }) {
  const { refresh } = useBilling();
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(String(amountCentavos / 100));
  const [paidOn, setPaidOn] = useState(todayManila());
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cents = pesoToCentavos(amount);
    if (!reference.trim()) { toast.error("Enter the reference number from your bank or e-wallet"); return; }
    if (!cents) { toast.error("Enter the amount you sent"); return; }
    setBusy(true);
    try {
      await api.submitPaymentClaim(invoiceId, {
        amountCentavos: cents,
        reference: reference.trim(),
        paidAt: new Date(`${paidOn}T12:00:00+08:00`).toISOString(),
        note: note.trim() || undefined,
        receipt,
      });
      setSubmitted(true);
      toast.success("Thanks — we'll confirm your payment shortly");
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not submit your payment"));
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <p className="text-sm text-center text-green-700 bg-green-50 rounded-md px-3 py-2">
        Payment submitted. Your store stays open while Kioscify verifies it.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium text-gray-900">Already paid? Tell us so we can confirm it.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm text-gray-700">
          Reference number
          <input value={reference} onChange={e => setReference(e.target.value)} required className={inputClass} />
        </label>
        <label className="text-sm text-gray-700">
          Amount sent (₱)
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm text-gray-700">
          Date paid
          <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className={inputClass} />
        </label>
        <label className="col-span-2 text-sm text-gray-700">
          Receipt screenshot (optional)
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={e => setReceipt(e.target.files?.[0] ?? null)}
            className="block w-full text-sm mt-1"
          />
        </label>
        <label className="col-span-2 text-sm text-gray-700">
          Note (optional)
          <input value={note} onChange={e => setNote(e.target.value)} className={inputClass} />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "I've paid"}
      </button>
    </form>
  );
}
