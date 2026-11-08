"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONSTITUTIONS_LIST, REGISTRATION_TYPES_LIST } from "./options";
import type { LegalInput } from "@/lib/platform/saas/legal-profile";
import { saveLegalProfileAction } from "./actions";

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";
const areaClass = "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

export default function LegalProfileForm({ initial, fromBilling, canEdit, updated }: { initial: LegalInput; fromBilling: { legalName: string; tradeName: string; gstin: string }; canEdit: boolean; updated: string | null }) {
  const [v, setV] = useState<LegalInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: keyof LegalInput) => (value: string) => {
    setSaved(false);
    setV((p) => ({ ...p, [k]: value }));
  };
  const field = (k: keyof LegalInput, label: string, control: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      {control}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  );
  const input = (k: keyof LegalInput, label: string, hint?: string, type = "text") => field(k, label, <Input id={k} type={type} value={v[k]} onChange={(e) => set(k)(e.target.value)} disabled={!canEdit} />, hint);
  const save = () =>
    start(async () => {
      setErrors({});
      const res = await saveLegalProfileAction(v).catch(() => ({ ok: false as const, errors: { form: "Could not save." } }));
      if (res.ok) setSaved(true);
      else setErrors(res.errors);
    });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Operator</h2>
        <p className="mt-1 text-xs text-muted-foreground">Legal name, trade name and GSTIN come from Tax &amp; invoicing so the policies and your invoices always agree: <span className="font-medium text-foreground">{fromBilling.legalName || "legal name not set"}</span>{fromBilling.tradeName ? ` (${fromBilling.tradeName})` : ""}{fromBilling.gstin ? `, GSTIN ${fromBilling.gstin}` : ", GSTIN not set"}.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {field("constitution", "Constitution", <select id="constitution" className={selectClass} value={v.constitution} onChange={(e) => set("constitution")(e.target.value)} disabled={!canEdit}><option value="">Not stated</option>{CONSTITUTIONS_LIST.map((c) => <option key={c} value={c}>{c}</option>)}</select>)}
          {field("registrationType", "Registration", <select id="registrationType" className={selectClass} value={v.registrationType} onChange={(e) => set("registrationType")(e.target.value)} disabled={!canEdit}><option value="">Not stated</option>{REGISTRATION_TYPES_LIST.map((c) => <option key={c} value={c}>{c}</option>)}</select>)}
          {input("registrationNo", "Registration number", "For example a CIN (U12345MH2020PTC123456) or an LLPIN (AAB-1234).")}
          <div className="sm:col-span-2">{field("registeredOffice", "Registered office address", <textarea id="registeredOffice" className={areaClass} value={v.registeredOffice} onChange={(e) => set("registeredOffice")(e.target.value)} disabled={!canEdit} />, "Prefilled from Tax & invoicing until you change it here.")}</div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Grievance Officer</h2>
        <p className="mt-1 text-xs text-muted-foreground">Published on the Grievance Redressal page and at the end of every policy. The IT (Intermediary Guidelines) Rules, 2021, the Consumer Protection (E-Commerce) Rules, 2020, the SPDI Rules, 2011 and the DPDP Act, 2023 require the officer&apos;s name and contact to be shown.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {input("grievanceName", "Name")}
          {input("grievanceDesignation", "Designation")}
          {input("grievanceEmail", "Email", "Use a monitored mailbox. Complaints are acknowledged within 24 hours.", "email")}
          {input("grievancePhone", "Phone")}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Jurisdiction and dates</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {input("jurisdictionCity", "City whose courts have jurisdiction", "Also the seat of arbitration. Left empty, the Terms say the courts at the registered office.")}
          {input("jurisdictionState", "State")}
          {input("effectiveDate", "Policies effective from", "Shown at the top of every policy.", "date")}
        </div>
      </section>

      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
      <div className="flex items-center gap-3">
        {canEdit && <Button type="button" onClick={save} disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Save</Button>}
        {saved && <span role="status" className="text-sm text-emerald-600">Saved. The public pages are updated.</span>}
        {updated && <span className="text-xs text-muted-foreground">Last saved {updated}</span>}
      </div>
    </div>
  );
}
