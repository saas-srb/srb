"use client";

import { useState, useTransition } from "react";
import { Info, Loader2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { PlatformBillingSettings } from "@/lib/platform/billing/settings";
import { saveBillingSettingsAction } from "./actions";

type Editable = Omit<PlatformBillingSettings, "updatedAt" | "updatedBy">;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";
const areaClass =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

export default function BillingSettingsForm({ initial, states, prefilled, canEdit = true }: { initial: Editable; states: { code: string; name: string }[]; prefilled: boolean; canEdit?: boolean }) {
  const [v, setV] = useState<Editable>(initial);
  const [reminders, setReminders] = useState(initial.billing.trialReminderDays.join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const gstinState = /^\d{2}/.test(v.seller.gstin.trim()) ? v.seller.gstin.trim().slice(0, 2) : null;

  const set = <K extends keyof Editable>(group: K, key: keyof Editable[K]) => (value: string | boolean) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
  };
  const err = (key: string) => (errors[key] ? <p className="text-xs text-destructive">{errors[key]}</p> : null);
  const field = (id: string, label: string, control: React.ReactNode, error?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {error && err(error)}
    </div>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        start(async () => {
          const res = await saveBillingSettingsAction({
            ...v,
            tax: { ...v.tax, gstRatePercent: Number(v.tax.gstRatePercent) },
            billing: { ...v.billing, defaultTrialDays: Number(v.billing.defaultTrialDays), graceDays: Number(v.billing.graceDays), trialReminderDays: reminders.split(",").map((s) => Number(s.trim())).filter((n) => n > 0) },
          });
          if (res.ok) {
            setErrors({});
            setSaved(true);
          } else setErrors(res.errors);
        });
      }}
    >
      <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
      {prefilled && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" />
          The seller details below are prefilled from your company&apos;s HRMS details and haven&apos;t been saved here yet. Review them and save — from then on this page is where they live.
        </p>
      )}

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Seller (printed on every SaaS invoice)</CardTitle>
          <CardDescription>Your registered business identity for GST.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("s-legal", "Legal name", <Input id="s-legal" value={v.seller.legalName} onChange={(e) => set("seller", "legalName")(e.target.value)} />, "seller.legalName")}
          {field("s-trade", "Trade name (optional)", <Input id="s-trade" value={v.seller.tradeName} onChange={(e) => set("seller", "tradeName")(e.target.value)} />)}
          {field("s-gstin", "GSTIN", <Input id="s-gstin" value={v.seller.gstin} onChange={(e) => set("seller", "gstin")(e.target.value.toUpperCase())} placeholder="33ABCDE1234F1Z7" maxLength={15} />, "seller.gstin")}
          {field(
            "s-state",
            "Registered state",
            <select id="s-state" className={selectClass} value={gstinState ?? v.seller.stateCode} onChange={(e) => set("seller", "stateCode")(e.target.value)} disabled={Boolean(gstinState)}>
              <option value="">Choose…</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>,
            "seller.stateCode",
          )}
          {field("s-pan", "PAN (optional)", <Input id="s-pan" value={v.seller.pan} onChange={(e) => set("seller", "pan")(e.target.value.toUpperCase())} maxLength={10} />)}
          {field("s-email", "Billing email", <Input id="s-email" type="email" value={v.seller.email} onChange={(e) => set("seller", "email")(e.target.value)} />, "seller.email")}
          {field("s-phone", "Phone (optional)", <Input id="s-phone" type="tel" value={v.seller.phone} onChange={(e) => set("seller", "phone")(e.target.value)} />)}
          <div className="sm:col-span-2">{field("s-address", "Registered address", <textarea id="s-address" className={areaClass} value={v.seller.address} onChange={(e) => set("seller", "address")(e.target.value)} />)}</div>
          {gstinState && <p className="text-xs text-muted-foreground sm:col-span-2">The state comes from the GSTIN&apos;s first two digits.</p>}
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Tax</CardTitle>
          <CardDescription>Intra-state invoices split GST into CGST + SGST; inter-state invoices charge IGST.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {field("t-rate", "GST rate (%)", <Input id="t-rate" type="number" min={0} max={40} step="0.01" value={v.tax.gstRatePercent} onChange={(e) => set("tax", "gstRatePercent")(e.target.value)} />, "tax.gstRatePercent")}
          {field("t-sac", "SAC code", <Input id="t-sac" value={v.tax.sacCode} onChange={(e) => set("tax", "sacCode")(e.target.value)} inputMode="numeric" />, "tax.sacCode")}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={v.tax.pricesIncludeTax} onChange={(e) => set("tax", "pricesIncludeTax")(e.target.checked)} />
            Plan prices already include GST
          </label>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
          <CardDescription>Numbering restarts each financial year, e.g. {v.invoice.prefix || "SAAS"}/26-27/00001 (16 characters at most under GST rules). Credit notes are numbered CN/26-27/00001.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("i-prefix", "Number prefix", <Input id="i-prefix" value={v.invoice.prefix} onChange={(e) => set("invoice", "prefix")(e.target.value.toUpperCase())} maxLength={4} />, "invoice.prefix")}
          {field("i-footer", "Footer note", <Input id="i-footer" value={v.invoice.footerNote} onChange={(e) => set("invoice", "footerNote")(e.target.value)} />)}
          <div className="sm:col-span-2">{field("i-terms", "Terms (optional)", <textarea id="i-terms" className={areaClass} value={v.invoice.terms} onChange={(e) => set("invoice", "terms")(e.target.value)} />)}</div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Billing defaults</CardTitle>
          <CardDescription>Used when a plan doesn&apos;t set its own value. Changes apply to new trials and subscriptions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          {field("b-cur", "Currency", <Input id="b-cur" value={v.billing.currency} onChange={(e) => set("billing", "currency")(e.target.value.toUpperCase())} maxLength={3} />, "billing.currency")}
          {field("b-trial", "Free trial (days)", <Input id="b-trial" type="number" min={0} max={365} value={v.billing.defaultTrialDays} onChange={(e) => set("billing", "defaultTrialDays")(e.target.value)} />, "billing.defaultTrialDays")}
          {field("b-grace", "Grace period (days)", <Input id="b-grace" type="number" min={0} max={60} value={v.billing.graceDays} onChange={(e) => set("billing", "graceDays")(e.target.value)} />, "billing.graceDays")}
          {field("b-rem", "Trial reminders (days before end)", <Input id="b-rem" value={reminders} onChange={(e) => { setSaved(false); setReminders(e.target.value); }} placeholder="7, 3, 1" />)}
        </CardContent>
      </GlassCard>
      </fieldset>

      {canEdit ? (
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Save settings"}
        </Button>
        {saved && <span className="text-sm text-emerald-600" aria-live="polite">Saved.</span>}
        {Object.keys(errors).length > 0 && <span className="text-sm text-destructive" aria-live="polite">{errors.form ?? "Fix the highlighted fields."}</span>}
      </div>
      ) : (
        <p className="text-sm text-muted-foreground">Your platform role can view these settings but not change them.</p>
      )}
    </form>
  );
}
