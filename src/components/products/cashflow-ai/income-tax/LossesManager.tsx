"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOSS_KIND_LABEL, type LossKind } from "@/lib/products/cashflow-ai/income-tax/core";
import { removeLossAction, saveLossAction } from "@/app/(products)/cashflow-ai/(protected)/income-tax/losses/actions";

export interface LossRow {
  id: string;
  fy: string;
  kind: LossKind;
  amount: number;
  available: number;
  validUntilFy: string | null;
  note: string | null;
}

const th = "px-2 py-1.5 text-left font-medium whitespace-nowrap";
const td = "px-2 py-1.5 align-top";
const sel = "mt-1 block h-9 w-56 rounded-lg border border-border bg-background px-2 text-sm text-foreground";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

interface Form { fy: string; kind: LossKind; amount: string; available: string; validUntilFy: string; note: string }
const EMPTY: Form = { fy: "", kind: "business", amount: "", available: "", validUntilFy: "", note: "" };

export default function LossesManager({ losses, canManage }: { losses: LossRow[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  function edit(l: LossRow | null) {
    setEditing(l ? l.id : "new");
    setF(l ? { fy: l.fy, kind: l.kind, amount: String(l.amount), available: String(l.available), validUntilFy: l.validUntilFy ?? "", note: l.note ?? "" } : EMPTY);
  }
  function save() {
    start(async () => {
      try {
        const res = await saveLossAction(editing === "new" ? null : editing, { fy: f.fy.trim(), kind: f.kind, amount: f.amount.trim() === "" ? null : Number(f.amount), available: f.available.trim() === "" ? null : Number(f.available), validUntilFy: f.validUntilFy.trim() || null, note: f.note.trim() || null });
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
  function remove(l: LossRow) {
    if (!window.confirm(`Remove the ${LOSS_KIND_LABEL[l.kind].toLowerCase()} of ${l.fy}?`)) return;
    start(async () => {
      try {
        const res = await removeLossAction(l.id);
        if (res.ok) router.refresh();
        else toast.error(res.error);
      } catch {
        toast.error("Could not remove. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {losses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No losses entered.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs text-muted-foreground">
              <tr>
                <th className={th}>Year it arose</th>
                <th className={th}>Kind</th>
                <th className={`${th} text-right`}>Original</th>
                <th className={`${th} text-right`}>Still available</th>
                <th className={th}>Can be used until</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {losses.map((l) => (
                <tr key={l.id} className="border-b border-border/30">
                  <td className={td}>{l.fy}</td>
                  <td className={td}>{LOSS_KIND_LABEL[l.kind]}{l.note ? <span className="block text-xs text-muted-foreground">{l.note}</span> : null}</td>
                  <td className={`${td} text-right tabular-nums`}>{inr(l.amount)}</td>
                  <td className={`${td} text-right tabular-nums`}>{inr(l.available)}</td>
                  <td className={td}>{l.validUntilFy ?? <span className="text-muted-foreground">Not entered</span>}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {canManage && (
                      <>
                        <Button type="button" size="sm" variant="ghost" onClick={() => edit(l)} disabled={pending}>Edit</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => remove(l)} disabled={pending}>Remove</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && editing === null && <Button type="button" variant="outline" onClick={() => edit(null)}>Add a loss</Button>}

      {canManage && editing !== null && (
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Year the loss arose<Input value={f.fy} placeholder="2024-25" maxLength={7} onChange={(e) => set("fy", e.target.value)} className="mt-1 w-32" /></label>
            <label className="text-xs text-muted-foreground">Kind
              <select value={f.kind} onChange={(e) => set("kind", e.target.value as LossKind)} className={sel}>
                {(Object.keys(LOSS_KIND_LABEL) as LossKind[]).map((k) => <option key={k} value={k}>{LOSS_KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Original loss (₹)<Input type="number" min={0} step="any" value={f.amount} onChange={(e) => set("amount", e.target.value)} className="mt-1 w-40" /></label>
            <label className="text-xs text-muted-foreground">Still available (₹)<Input type="number" min={0} step="any" value={f.available} onChange={(e) => set("available", e.target.value)} className="mt-1 w-40" /></label>
            <label className="text-xs text-muted-foreground">Last year it can be used (optional)<Input value={f.validUntilFy} placeholder="as your CA says" maxLength={7} onChange={(e) => set("validUntilFy", e.target.value)} className="mt-1 w-44" /></label>
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
