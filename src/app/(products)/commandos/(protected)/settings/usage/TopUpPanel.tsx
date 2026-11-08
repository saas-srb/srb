"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Check, Clock, Globe, Loader2, Lock, Mail, Mic, Plus, Receipt, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { openOrderCheckout } from "@/components/platform/billing/razorpay-checkout";
import { formatMoney } from "@/lib/platform/billing/types";
import { formatUnits, type TopupService, type TopupView } from "@/lib/platform/billing/topup-catalog";
import { confirmTopupAction, startTopupAction } from "./topup-actions";

const ICON: Record<TopupService, LucideIcon> = { ai_tokens: Bot, emails: Mail, voice_minutes: Mic, domains: Globe };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * "Add capacity": pay once for extra AI tokens, emails, voice minutes or custom domains, whenever you want. Consumables are used only after the
 * plan's own monthly allowance runs out, don't reset with the month and last 12 months. The price shown is what is charged, GST included; it is
 * worked out on the server (the browser only says which pack).
 */
export default function TopUpPanel({ view }: { view: TopupView }) {
  const router = useRouter();
  const [open, setOpen] = useState<TopupService | null>(null);
  const [packId, setPackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsDetails, setNeedsDetails] = useState(false);
  const [busy, start] = useTransition();
  // "paying": the Razorpay form is shown inside this dialog, in place of the pack list (nothing opens over the page).
  const [phase, setPhase] = useState<"choose" | "paying">("choose");
  const payMount = useRef<HTMLDivElement>(null);
  const service = view.services.find((s) => s.key === open) ?? null;
  const pack = service?.packs.find((p) => p.id === packId) ?? null;

  const show = (key: TopupService) => {
    const s = view.services.find((x) => x.key === key)!;
    setOpen(key);
    setPhase("choose");
    setPackId(s.packs.find((p) => p.popular)?.id ?? s.packs[0]?.id ?? null);
    setError(null);
    setNeedsDetails(false);
  };

  const pay = () =>
    start(async () => {
      if (!pack) return;
      setError(null);
      setNeedsDetails(false);
      const res = await startTopupAction(pack.id).catch(() => null);
      if (!res) return setError("Something went wrong. Please try again.");
      if (!res.ok) {
        setNeedsDetails(!!res.needsBillingDetails);
        return setError(res.error);
      }
      const c = res.checkout;
      let failed: string | null = null;
      // The form needs its area on screen (with a width) before it opens: show it, wait two frames, then open.
      setPhase("paying");
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const paid = await openOrderCheckout({ key: c.key, orderId: c.orderId, amount: c.amount, currency: c.currency, name: c.name, description: c.description, prefill: c.prefill, onPaymentFailed: (m) => (failed = m), mount: payMount.current, surface: "--popover" }).catch(() => null);
      if (!paid) {
        setPhase("choose");
        return setError(failed ?? "Checkout closed. Nothing was charged.");
      }
      setPhase("choose");
      const done = await confirmTopupAction(paid).catch((): { ok: false; error: string } => ({ ok: false, error: "Payment received, but we couldn't confirm it yet. Your top-up is added automatically within a few minutes." }));
      if (!done.ok) return setError(done.error);
      toast.success("Top-up added", { description: done.message });
      setOpen(null);
      router.refresh();
    });

  return (
    <section aria-labelledby="topup-heading" className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5" id="topups">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="topup-heading" className="flex items-center gap-2 text-lg font-black tracking-tight"><Sparkles className="size-5 text-primary" /> Add capacity</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">Running short before the month ends? Buy more AI tokens, emails, voice minutes or domains, once, whenever you need. No plan change, no subscription: you pay only for what you add.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"><ShieldCheck className="size-3.5" /> One-time payment by Razorpay</span>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view.services.map((s) => {
          const Icon = ICON[s.key];
          return (
            <li key={s.key} className="flex flex-col rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4.5" /></span>
                <p className="text-sm font-bold">{s.label}</p>
              </div>
              <p className="mt-3 text-xl font-black tabular-nums">{s.remaining > 0 ? formatUnits(s.key, Math.floor(s.remaining)) : "None added"}</p>
              <p className="text-xs text-muted-foreground">
                {s.remaining > 0 ? (s.consumable ? "left in credits" : "extra slots") : s.note}
                {s.nextExpiry ? ` · until ${fmtDate(s.nextExpiry)}` : ""}
              </p>
              {s.consumable && s.usedThisMonth > 0 && <p className="mt-1 text-xs text-muted-foreground">{formatUnits(s.key, Math.round(s.usedThisMonth))} used this month</p>}
              <Button type="button" variant="outline" size="sm" className="mt-4" disabled={!!view.blocked} onClick={() => show(s.key)} title={view.blocked ?? undefined}>
                <Plus className="size-4" /> Add more
              </Button>
            </li>
          );
        })}
      </ul>
      {view.blocked && <p className="mt-3 text-sm text-muted-foreground">{view.blocked}</p>}

      {view.active.length > 0 && (
        <details className="group mt-4 rounded-xl border border-border/60 bg-background/40 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">Your credits ({view.active.length})</summary>
          <ul className="mt-3 divide-y divide-border/60">
            {view.active.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-semibold">{a.label}</span> <span className="text-muted-foreground">· {a.remainingLabel}</span></span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> bought {fmtDate(a.purchasedAt)}, lasts until {fmtDate(a.expiresAt)}</span>
                  {a.invoiceNumber && <Link href="/commandos/settings/billing/invoices" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><Receipt className="size-3.5" /> {a.invoiceNumber}</Link>}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={!!service} onOpenChange={(o) => !busy && phase === "choose" && !o && setOpen(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto p-6 sm:max-w-xl">
          {service && (
            <>
              <div className={phase === "paying" ? "hidden" : "space-y-4"}>
              <DialogHeader>
                <DialogTitle>Add {service.noun}</DialogTitle>
                <DialogDescription>
                  {service.consumable ? `Used only after your monthly ${service.noun} run out, kept for 12 months, and not reset at month end.` : "Extra slots for 12 months, on top of your plan."}
                </DialogDescription>
              </DialogHeader>
              <div role="radiogroup" aria-label="Pack" className="space-y-2.5">
                {service.packs.map((p) => {
                  const on = packId === p.id;
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => setPackId(p.id)} className={`relative flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors ${on ? "border-primary/60 bg-primary/10" : "border-border bg-muted/20 hover:bg-muted/40"}`}>
                      {p.popular && <span className="absolute -top-2 left-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Most popular</span>}
                      <span className="flex items-center gap-3">
                        <span className={`flex size-5 items-center justify-center rounded-full border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{on && <Check className="size-3" />}</span>
                        <span className="font-bold">{p.label}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-base font-black tabular-nums">{formatMoney(p.total, p.currency)}</span>
                        <span className="block text-[11px] text-muted-foreground">incl. {view.gstRatePercent}% GST</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {pack && (
                <p className="rounded-xl bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
                  {formatMoney(pack.net, pack.currency)} + {formatMoney(pack.gst, pack.currency)} GST = <span className="font-bold text-foreground">{formatMoney(pack.total, pack.currency)}</span>. A GST invoice and a receipt are emailed and kept under Invoices &amp; payments.
                </p>
              )}
              <p role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
                {error}{" "}
                {needsDetails && <Link href="/commandos/settings/billing#billing-details" className="font-semibold underline">Add billing details</Link>}
              </p>
              <Button type="button" size="lg" className="h-11 w-full" disabled={busy || !pack} onClick={pay}>
                {busy ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Lock className="size-4" data-icon="inline-start" />}
                {pack ? `Pay ${formatMoney(pack.total, pack.currency)}` : "Choose a pack"}
              </Button>
              </div>
              {/* Razorpay's form docks in here while paying (see razorpay-checkout.ts); closing it returns to the packs. */}
              <div className={phase === "paying" ? "space-y-3" : "hidden"}>
                <p className="text-sm font-bold">Pay for {pack ? pack.label : "your top-up"}</p>
                <div ref={payMount} className="relative mx-auto h-[min(600px,70vh)] w-full max-w-[480px] overflow-hidden rounded-2xl ring-1 ring-border" aria-label="Secure payment with Razorpay" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
