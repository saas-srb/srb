"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bounceChequeAction, clearChequeAction } from "@/app/(products)/cashflow-ai/(protected)/receipts/actions";

export default function ChequeActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return void setError(r.error ?? "Could not save.");
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 rounded-lg border p-3">
        <Label>The bank cleared it on</Label>
        <Input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        <Button size="sm" disabled={pending} onClick={() => run(() => clearChequeAction(id, date), "Cheque cleared and booked")}>{pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" data-icon="inline-start" />}Mark cleared</Button>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <Label>It bounced because</Label>
        <Input value={reason} maxLength={300} placeholder="For example: insufficient funds" onChange={(e) => setReason(e.target.value)} />
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => bounceChequeAction(id, reason), "Marked as bounced")}><X className="size-3.5" data-icon="inline-start" />Mark bounced</Button>
      </div>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive sm:col-span-2">{error}</p>}
    </div>
  );
}
