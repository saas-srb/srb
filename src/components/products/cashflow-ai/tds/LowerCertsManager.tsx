"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { removeLowerCertAction, saveLowerCertAction } from "@/app/(products)/cashflow-ai/(protected)/tds/certificates/actions";

export interface LowerCertRow {
  id: string;
  vendorId: string;
  vendorName: string;
  section: string;
  certificateNumber: string;
  nil: boolean;
  rate: number | null;
  validFrom: string;
  validTo: string;
  maxAmount: number | null;
  note: string | null;
}

const dmy = (iso: string) => iso.split("-").reverse().join("-");
const th = "px-2 py-1.5 text-left font-medium whitespace-nowrap";
const td = "px-2 py-1.5 align-top";
const sel = "mt-1 block h-8 w-56 rounded-lg border border-border bg-background px-2 text-sm text-foreground";

interface Form {
  vendorId: string;
  section: string;
  certificateNumber: string;
  nil: boolean;
  rate: string;
  validFrom: string;
  validTo: string;
  maxAmount: string;
  note: string;
}
const EMPTY: Form = { vendorId: "", section: "", certificateNumber: "", nil: false, rate: "", validFrom: "", validTo: "", maxAmount: "", note: "" };
const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export default function LowerCertsManager({ certs, vendors, sections, canManage, today }: { certs: LowerCertRow[]; vendors: { id: string; name: string }[]; sections: string[]; canManage: boolean; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  function edit(c: LowerCertRow | null) {
    setEditing(c ? c.id : "new");
    setF(c ? { vendorId: c.vendorId, section: c.section, certificateNumber: c.certificateNumber, nil: c.nil, rate: c.rate === null ? "" : String(c.rate), validFrom: c.validFrom, validTo: c.validTo, maxAmount: c.maxAmount === null ? "" : String(c.maxAmount), note: c.note ?? "" } : { ...EMPTY, validFrom: today });
  }
  function save() {
    start(async () => {
      try {
        const res = await saveLowerCertAction(editing === "new" ? null : editing, { vendorId: f.vendorId, section: f.section, certificateNumber: f.certificateNumber, nil: f.nil, rate: f.nil ? null : numOrNull(f.rate), validFrom: f.validFrom, validTo: f.validTo, maxAmount: numOrNull(f.maxAmount), note: f.note.trim() || null });
        if (res.ok) {
          setEditing(null);
          toast.success("Saved.");
          router.refresh();
        } else toast.error(res.error);
      } catch {
        toast.error("Could not save. Please try again.");
      }
    });
  }
  function remove(c: LowerCertRow) {
    if (!window.confirm(`Remove certificate ${c.certificateNumber} for ${c.vendorName}?`)) return;
    start(async () => {
      try {
        const res = await removeLowerCertAction(c.id);
        if (res.ok) router.refresh();
        else toast.error(res.error);
      } catch {
        toast.error("Could not remove. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {certs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lower or nil deduction certificates recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className={th}>Vendor</th>
                <th className={th}>Section</th>
                <th className={th}>Certificate no.</th>
                <th className={th}>Rate</th>
                <th className={th}>Valid</th>
                <th className={`${th} text-right`}>Maximum amount</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id} className="border-b border-border/30">
                  <td className={td}>{c.vendorName}{c.note ? <span className="block text-xs text-muted-foreground">{c.note}</span> : null}</td>
                  <td className={td}>{c.section}</td>
                  <td className={`${td} font-mono text-xs`}>{c.certificateNumber}</td>
                  <td className={td}>{c.nil ? "Nil deduction" : `${c.rate}%`}</td>
                  <td className={`${td} whitespace-nowrap`}>{dmy(c.validFrom)} to {dmy(c.validTo)}{c.validTo < today ? <span className="ml-1 text-xs text-muted-foreground">(expired)</span> : null}</td>
                  <td className={`${td} text-right tabular-nums`}>{c.maxAmount === null ? "—" : c.maxAmount.toLocaleString("en-IN")}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {canManage && (
                      <>
                        <Button type="button" size="sm" variant="ghost" onClick={() => edit(c)} disabled={pending}>Edit</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => remove(c)} disabled={pending}>Remove</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && editing === null && <Button type="button" variant="outline" onClick={() => edit(null)}>Add a certificate</Button>}

      {canManage && editing !== null && (
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Vendor
              <select value={f.vendorId} onChange={(e) => set("vendorId", e.target.value)} className={sel}>
                <option value="">Choose…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Section
              <select value={f.section} onChange={(e) => set("section", e.target.value)} className={`${sel} w-32`}>
                <option value="">Choose…</option>
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Certificate number<Input value={f.certificateNumber} maxLength={40} onChange={(e) => set("certificateNumber", e.target.value)} className="mt-1 w-52" /></label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" checked={f.nil} onChange={(e) => set("nil", e.target.checked)} /> Nil deduction (no tax)</label>
            {!f.nil && <label className="text-xs text-muted-foreground">Lower rate (%)<Input type="number" min={0} max={100} step="any" value={f.rate} onChange={(e) => set("rate", e.target.value)} className="mt-1 w-28" /></label>}
            <label className="text-xs text-muted-foreground">Valid from<Input type="date" value={f.validFrom} onChange={(e) => set("validFrom", e.target.value)} className="mt-1 w-44" /></label>
            <label className="text-xs text-muted-foreground">Valid to<Input type="date" value={f.validTo} onChange={(e) => set("validTo", e.target.value)} className="mt-1 w-44" /></label>
            <label className="text-xs text-muted-foreground">Maximum amount (optional)<Input type="number" min={0} step="any" value={f.maxAmount} onChange={(e) => set("maxAmount", e.target.value)} className="mt-1 w-40" /></label>
          </div>
          <label className="block text-xs text-muted-foreground">Note (optional)<Input value={f.note} maxLength={500} onChange={(e) => set("note", e.target.value)} className="mt-1" /></label>
          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={pending}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
