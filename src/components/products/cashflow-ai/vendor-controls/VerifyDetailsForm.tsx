"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import { verifyBankDetailsAction } from "@/app/(products)/cashflow-ai/(protected)/vendor-controls/actions";

const field = "h-9 rounded-lg border border-border bg-background px-2 text-sm";

export function VerifyDetailsForm({ vendorId, token, methods, blockedReason }: { vendorId: string; token: string; methods: { value: string; label: string }[]; blockedReason: string | null }) {
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();

  if (blockedReason) return <p className="text-sm text-muted-foreground">{blockedReason}</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await verifyBankDetailsAction(vendorId, token, method, note, code);
            if (r.ok) {
              toast.success(r.message ?? "Verified");
              setNote("");
              setCode("");
            } else toast.error(r.error);
          } catch {
            toast.error("Could not save. Please try again.");
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">How did you check?
          <select required value={method} onChange={(e) => setMethod(e.target.value)} className={`${field} mt-1 block`}>
            <option value="" disabled>Choose…</option>
            {methods.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label className="min-w-64 flex-1 text-xs text-muted-foreground">Who you spoke to, or what you received
          <input required minLength={10} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Spoke to Mr Rao, accounts, on the number in our contract" className={`${field} mt-1 block w-full`} />
        </label>
      </div>
      <div className="max-w-md"><PaymentCodeField value={code} onChange={setCode} /></div>
      <Button type="submit" size="sm" disabled={pending || !method || note.trim().length < 10}>{pending ? "Saving…" : "These details are genuine"}</Button>
    </form>
  );
}
