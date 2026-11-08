"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CopyButton from "@/components/products/cashflow-ai/CopyButton";
import { createCollectLinkAction, type CollectResult } from "@/app/(products)/cashflow-ai/(protected)/receivables/actions";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export default function CollectMoneyForm({ portals }: { portals: { value: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ payerName: "", payerEmail: "", payerPhone: "", amount: "", purpose: "", portal: portals[0]?.value ?? "DIRECT" });
  const [result, setResult] = useState<CollectResult | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const err = (k: string) => result?.fieldErrors?.[k] && <p className="text-xs text-destructive">{result.fieldErrors[k]}</p>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    start(async () => {
      try {
        const r = await createCollectLinkAction(f);
        setResult(r);
        if (r.ok) {
          setF((x) => ({ ...x, payerName: "", payerEmail: "", payerPhone: "", amount: "", purpose: "" }));
          router.refresh();
        }
      } catch {
        setResult({ ok: false, error: "Something went wrong. Please try again." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5"><Label>Payer / customer name *</Label><Input value={f.payerName} maxLength={120} onChange={(e) => set("payerName", e.target.value)} placeholder="e.g. Rahul Sharma / ABC Tech" />{err("payerName")}</div>
      <div className="space-y-1.5"><Label>Their email *</Label><Input type="email" value={f.payerEmail} onChange={(e) => set("payerEmail", e.target.value)} placeholder="The link is sent here" />{err("payerEmail")}</div>
      <div className="space-y-1.5"><Label>Amount to collect (₹) *</Label><Input inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="e.g. 25000" />{err("amount")}</div>
      <div className="space-y-1.5"><Label>Purpose / title</Label><Input value={f.purpose} maxLength={120} onChange={(e) => set("purpose", e.target.value)} placeholder="e.g. AI Batch Course Fee" /></div>
      <div className="space-y-1.5"><Label>Phone (optional)</Label><Input inputMode="tel" value={f.payerPhone} onChange={(e) => set("payerPhone", e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Target portal / channel</Label>
        <select className={selectCls} value={f.portal} onChange={(e) => set("portal", e.target.value)}>{portals.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
      </div>
      <div className="flex items-end justify-end sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" data-icon="inline-start" />}Generate &amp; send payment link</Button>
      </div>
      {result && !result.ok && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive sm:col-span-2 lg:col-span-4">{result.error}</p>}
      {result?.ok && result.url && (
        <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm sm:col-span-2 lg:col-span-4">
          <p className="font-medium">{result.emailSent ? "Link created and emailed to the customer." : "Link created, but the email could not be sent. Copy the link and send it yourself."}</p>
          {!result.emailSent && result.emailError && <p className="text-xs text-muted-foreground">{result.emailError}</p>}
          <div className="flex flex-wrap items-center gap-2"><code className="break-all rounded bg-background px-2 py-1 text-xs">{result.url}</code><CopyButton value={result.url} label="Copy link" /></div>
        </div>
      )}
    </form>
  );
}
