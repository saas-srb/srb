"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { GST_STATES, validateBillingDetails, type BillingDetails, type BillingDetailsErrors } from "@/lib/platform/billing/billing-details";

export type SaveBillingDetails = (input: Partial<BillingDetails>) => Promise<{ ok: true; details: BillingDetails } | { ok: false; errors: BillingDetailsErrors }>;

const EMPTY = { legalName: "", gstin: "", address: "", state: "", email: "" };

/** Legal name, GSTIN, address, state and invoice email — validated here for feedback and again on the server. */
export default function BillingDetailsForm({ initial, save, onSaved }: { initial: BillingDetails | null; save: SaveBillingDetails; onSaved: (details: BillingDetails) => void }) {
  const [form, setForm] = useState(initial ? { ...initial, gstin: initial.gstin ?? "" } : EMPTY);
  const [errors, setErrors] = useState<BillingDetailsErrors>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSave] = useTransition();

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((errs) => ({ ...errs, [key]: undefined }));
  };

  const field = (key: keyof typeof EMPTY) => ({
    id: `billing-${key}`,
    name: key,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `billing-${key}-error` : undefined,
  });

  const errorText = (key: keyof typeof EMPTY) =>
    errors[key] ? (
      <p id={`billing-${key}-error`} className="text-xs text-destructive">
        {errors[key]}
      </p>
    ) : null;

  return (
    <form
      noValidate
      className="space-y-4"
      aria-label="Billing details"
      onSubmit={(e) => {
        e.preventDefault();
        setNotice(null);
        const local = validateBillingDetails(form);
        if (!local.ok) {
          setErrors(local.errors);
          return;
        }
        startSave(async () => {
          try {
            const res = await save(local.value);
            if (res.ok) {
              setErrors({});
              setForm({ ...res.details, gstin: res.details.gstin ?? "" });
              setNotice({ tone: "ok", text: "Billing details saved." });
              onSaved(res.details);
            } else setErrors(res.errors);
          } catch {
            setNotice({ tone: "error", text: "Something went wrong. Please try again." });
          }
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="billing-legalName">Legal company name</Label>
          <Input {...field("legalName")} value={form.legalName} onChange={set("legalName")} maxLength={200} autoComplete="organization" required />
          {errorText("legalName")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-gstin">
            GSTIN <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input {...field("gstin")} value={form.gstin} onChange={set("gstin")} maxLength={15} autoCapitalize="characters" spellCheck={false} placeholder="27AAPFU0939F1ZV" className="font-mono uppercase" />
          {errorText("gstin")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-email">Invoice email</Label>
          <Input {...field("email")} type="email" value={form.email} onChange={set("email")} maxLength={254} autoComplete="email" required />
          {errorText("email")}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="billing-address">Billing address</Label>
          <Textarea {...field("address")} value={form.address} onChange={set("address")} maxLength={500} rows={3} autoComplete="street-address" required />
          {errorText("address")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-state">State</Label>
          <select
            {...field("state")}
            value={form.state}
            onChange={set("state")}
            required
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
          >
            <option value="">Choose a state…</option>
            {GST_STATES.map((s) => (
              <option key={s.code} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          {errorText("state")}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save billing details
        </Button>
        <p aria-live="polite" className={notice?.tone === "error" ? "text-sm text-destructive" : "text-sm text-emerald-700 dark:text-emerald-400"}>
          {notice?.text}
        </p>
      </div>
    </form>
  );
}
