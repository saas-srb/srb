"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuditApplicable } from "@/lib/products/cashflow-ai/income-tax/registers-core";
import { saveReturnAction } from "@/app/(products)/cashflow-ai/(protected)/income-tax/returns/actions";

export interface ReturnValues {
  formLabel: string | null;
  filedOn: string | null;
  acknowledgementNo: string | null;
  verifiedOn: string | null;
  auditApplicable: AuditApplicable;
  auditReportFiledOn: string | null;
  auditUdin: string | null;
  auditedBy: string | null;
  note: string | null;
}

const sel = "mt-1 block h-9 w-56 rounded-lg border border-border bg-background px-2 text-sm text-foreground";
const s = (v: string | null) => v ?? "";

export default function ReturnStatusEditor({ fy, initial, canManage, today }: { fy: string; initial: ReturnValues | null; canManage: boolean; today: string }) {
  const router = useRouter();
  const [f, setF] = useState({ formLabel: s(initial?.formLabel ?? null), filedOn: s(initial?.filedOn ?? null), acknowledgementNo: s(initial?.acknowledgementNo ?? null), verifiedOn: s(initial?.verifiedOn ?? null), auditApplicable: (initial?.auditApplicable ?? "undecided") as AuditApplicable, auditReportFiledOn: s(initial?.auditReportFiledOn ?? null), auditUdin: s(initial?.auditUdin ?? null), auditedBy: s(initial?.auditedBy ?? null), note: s(initial?.note ?? null) });
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const nul = (v: string) => v.trim() || null;

  function save() {
    start(async () => {
      try {
        const res = await saveReturnAction(fy, { formLabel: nul(f.formLabel), filedOn: nul(f.filedOn), acknowledgementNo: nul(f.acknowledgementNo), verifiedOn: nul(f.verifiedOn), auditApplicable: f.auditApplicable, auditReportFiledOn: nul(f.auditReportFiledOn), auditUdin: nul(f.auditUdin), auditedBy: nul(f.auditedBy), note: nul(f.note) });
        if (res.ok) {
          toast.success("Saved.");
          router.refresh();
        } else toast.error(res.error);
      } catch {
        toast.error("Could not save. Please try again.");
      }
    });
  }

  const dis = !canManage || pending;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Return form (optional)<Input value={f.formLabel} placeholder="e.g. ITR-6" maxLength={40} disabled={dis} onChange={(e) => set("formLabel", e.target.value)} className="mt-1 w-40" /></label>
        <label className="text-xs text-muted-foreground">Return filed on<Input type="date" max={today} value={f.filedOn} disabled={dis} onChange={(e) => set("filedOn", e.target.value)} className="mt-1 w-44" /></label>
        <label className="text-xs text-muted-foreground">Acknowledgement number<Input value={f.acknowledgementNo} maxLength={60} disabled={dis} onChange={(e) => set("acknowledgementNo", e.target.value)} className="mt-1 w-56" /></label>
        <label className="text-xs text-muted-foreground">E-verified on<Input type="date" max={today} value={f.verifiedOn} disabled={dis} onChange={(e) => set("verifiedOn", e.target.value)} className="mt-1 w-44" /></label>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">Tax audit applies? (your CA decides)
          <select value={f.auditApplicable} disabled={dis} onChange={(e) => set("auditApplicable", e.target.value as AuditApplicable)} className={sel}>
            <option value="undecided">Not decided yet</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        {f.auditApplicable === "yes" && (
          <>
            <label className="text-xs text-muted-foreground">Audit report filed on<Input type="date" max={today} value={f.auditReportFiledOn} disabled={dis} onChange={(e) => set("auditReportFiledOn", e.target.value)} className="mt-1 w-44" /></label>
            <label className="text-xs text-muted-foreground">UDIN or acknowledgement<Input value={f.auditUdin} maxLength={60} disabled={dis} onChange={(e) => set("auditUdin", e.target.value)} className="mt-1 w-56" /></label>
          </>
        )}
        <label className="text-xs text-muted-foreground">Books kept / audit done by (optional)<Input value={f.auditedBy} maxLength={120} disabled={dis} onChange={(e) => set("auditedBy", e.target.value)} className="mt-1 w-64" /></label>
      </div>
      <label className="block text-xs text-muted-foreground">Note (optional)<Input value={f.note} maxLength={500} disabled={dis} onChange={(e) => set("note", e.target.value)} className="mt-1" /></label>
      {canManage && <Button type="button" onClick={save} disabled={pending}>Save</Button>}
    </div>
  );
}
