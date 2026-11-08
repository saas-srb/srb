"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ADJUSTMENT_HEADS, type Adjustment, type LossLine, type SetOff, type TaxRates, LOSS_KIND_LABEL } from "@/lib/products/cashflow-ai/income-tax/core";
import { addAdjustmentAction, postProvisionAction, removeAdjustmentAction, removeProvisionAction, saveNoteAction, saveRatesAction, saveSetOffsAction, setRegimeAction } from "@/app/(products)/cashflow-ai/(protected)/income-tax/actions";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

const field = "mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground disabled:opacity-60";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) toast.success(success);
        else toast.error(r.error ?? "Could not save.");
      } catch {
        toast.error("Could not save. Please try again.");
      }
    });
  return { pending, run };
}

export interface RegimeChoice { id: string; label: string; who: string; rateText: string }

/** The company only picks the basis it pays tax under; the numbers are the platform's and are shown in words on the page. */
export function RegimeChooser({ fy, choices, chosen, canManage }: { fy: string; choices: RegimeChoice[]; chosen: string | null; canManage: boolean }) {
  const [sel, setSel] = useState(chosen);
  const { pending, run } = useRun();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (sel) run(() => setRegimeAction(fy, sel), "Tax basis saved"); }}>
      <div className="grid gap-3 md:grid-cols-3">
        {choices.map((c) => (
          <label key={c.id} className={`block cursor-pointer rounded-xl border p-3 text-sm ${sel === c.id ? "border-primary bg-primary/5" : "border-border"} ${canManage ? "" : "cursor-default opacity-80"}`}>
            <span className="flex items-start gap-2"><input type="radio" name="regime" className="mt-1" disabled={!canManage} checked={sel === c.id} onChange={() => setSel(c.id)} /><span className="font-medium">{c.label}</span></span>
            <span className="mt-1 block text-xs text-muted-foreground">{c.who}</span>
            <span className="mt-1 block text-xs">{c.rateText}</span>
          </label>
        ))}
      </div>
      {canManage && <Button type="submit" size="sm" disabled={pending || !sel || sel === chosen}>{pending ? "Saving…" : "Save my choice"}</Button>}
    </form>
  );
}

export function RatesForm({ fy, rates, canManage }: { fy: string; rates: TaxRates; canManage: boolean }) {
  const [v, setV] = useState({ regimeLabel: rates.regimeLabel ?? "", baseRate: rates.baseRate?.toString() ?? "", surchargeRate: rates.surchargeRate?.toString() ?? "", cessRate: rates.cessRate?.toString() ?? "", matRate: rates.matRate?.toString() ?? "", matApplicable: rates.matApplicable, confirmed: rates.confirmed });
  const { pending, run } = useRun();
  const set = (k: keyof typeof v, val: string | boolean) => setV((x) => ({ ...x, [k]: val }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveRatesAction(fy, v), "Rates saved"); }}>
      <div className="grid gap-3 sm:grid-cols-5">
        <label className="text-xs text-muted-foreground sm:col-span-2">Name of the basis<input className={field} disabled={!canManage} maxLength={120} value={v.regimeLabel} onChange={(e) => set("regimeLabel", e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">Tax rate %<input className={field} disabled={!canManage} inputMode="decimal" value={v.baseRate} onChange={(e) => set("baseRate", e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">Surcharge %<input className={field} disabled={!canManage} inputMode="decimal" value={v.surchargeRate} onChange={(e) => set("surchargeRate", e.target.value)} /></label>
        <label className="text-xs text-muted-foreground">Cess %<input className={field} disabled={!canManage} inputMode="decimal" value={v.cessRate} onChange={(e) => set("cessRate", e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canManage} checked={v.matApplicable} onChange={(e) => set("matApplicable", e.target.checked)} /> MAT has to be worked this year</label>
        <label className="text-xs text-muted-foreground">MAT rate % of book profit<input className={`${field} w-32`} disabled={!canManage || !v.matApplicable} inputMode="decimal" value={v.matRate} onChange={(e) => set("matRate", e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canManage} checked={v.confirmed} onChange={(e) => set("confirmed", e.target.checked)} /> These rates have been confirmed</label>
        {canManage && <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Use my own rates"}</Button>}
      </div>
    </form>
  );
}

export function AdjustmentsPanel({ fy, adjustments, canManage }: { fy: string; adjustments: Adjustment[]; canManage: boolean }) {
  const [kind, setKind] = useState<"add" | "less">("add");
  const [head, setHead] = useState("");
  const [amount, setAmount] = useState("");
  const [scope, setScope] = useState("both");
  const [basis, setBasis] = useState("");
  const { pending, run } = useRun();
  const heads = ADJUSTMENT_HEADS.filter((h) => h.kind === kind);
  return (
    <div className="space-y-3">
      {adjustments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No adjustments yet. Your CA tells you what to add back to the book profit and what to deduct.</p>
      ) : (
        <ul className="divide-y divide-border/40 text-sm">
          {adjustments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className={a.kind === "add" ? "text-foreground" : "text-green-700 dark:text-green-400"}>{a.kind === "add" ? "Add" : "Less"}</span> · {a.head}{a.basis ? <span className="text-xs text-muted-foreground"> — {a.basis}</span> : null} <span className="text-xs text-muted-foreground">({a.scope === "both" ? "normal tax and MAT" : a.scope === "mat" ? "MAT only" : "normal tax only"})</span></span>
              <span className="flex items-center gap-3">{formatMoney(a.amount)}{canManage && <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => removeAdjustmentAction(fy, a.id), "Removed")}>Remove</Button>}</span>
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form className="grid gap-3 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await addAdjustmentAction(fy, { kind, head, amount, scope, basis }); if (r.ok) { setHead(""); setAmount(""); setBasis(""); } return r; }, "Adjustment added"); }}>
          <label className="text-xs text-muted-foreground">Add or less
            <select className={field} value={kind} onChange={(e) => { setKind(e.target.value as "add" | "less"); setHead(""); }}><option value="add">Add to profit</option><option value="less">Deduct from profit</option></select>
          </label>
          <label className="text-xs text-muted-foreground sm:col-span-2">What for
            <input className={field} list="it-heads" required maxLength={160} value={head} onChange={(e) => setHead(e.target.value)} />
            <datalist id="it-heads">{heads.map((h) => <option key={h.label} value={h.label} />)}</datalist>
          </label>
          <label className="text-xs text-muted-foreground">Amount<input className={field} required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="text-xs text-muted-foreground">Applies to
            <select className={field} value={scope} onChange={(e) => setScope(e.target.value)}><option value="both">Normal tax and MAT</option><option value="normal">Normal tax only</option><option value="mat">MAT only</option></select>
          </label>
          <label className="text-xs text-muted-foreground">Basis / note<input className={field} maxLength={300} value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="CA's workings" /></label>
          <div className="sm:col-span-6"><Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add"}</Button></div>
        </form>
      )}
    </div>
  );
}

export function SetOffPanel({ fy, losses, setOffs, canManage }: { fy: string; losses: LossLine[]; setOffs: SetOff[]; canManage: boolean }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(setOffs.map((s) => [s.lossId, String(s.amount)])));
  const { pending, run } = useRun();
  if (losses.length === 0) return <p className="text-sm text-muted-foreground">No losses are recorded. Add them under “Losses carried forward”.</p>;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => saveSetOffsAction(fy, losses.map((l) => ({ lossId: l.id, amount: vals[l.id] ?? "" }))), "Set-off saved"); }}>
      {losses.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{LOSS_KIND_LABEL[l.kind]} of {l.fy} · available {formatMoney(l.available)}{l.validUntilFy ? ` · carried to ${l.validUntilFy}` : ""}</span>
          <input className="h-9 w-36 rounded-lg border border-border bg-background px-2 text-sm" disabled={!canManage} inputMode="decimal" placeholder="Set off" value={vals[l.id] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [l.id]: e.target.value }))} aria-label={`Set off against ${l.fy} loss`} />
        </div>
      ))}
      {canManage && <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save set-off"}</Button>}
    </form>
  );
}

export function NotePanel({ fy, note, agreed, canManage }: { fy: string; note: string; agreed: string; canManage: boolean }) {
  const [n, setN] = useState(note);
  const [a, setA] = useState(agreed);
  const { pending, run } = useRun();
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => saveNoteAction(fy, n, a), "Saved"); }}>
      <label className="block text-xs text-muted-foreground">Agreed with (CA / firm, and when)<input className={field} disabled={!canManage} maxLength={200} value={a} onChange={(e) => setA(e.target.value)} /></label>
      <label className="block text-xs text-muted-foreground">Note<textarea className={`${field} h-20 py-2`} disabled={!canManage} maxLength={1000} value={n} onChange={(e) => setN(e.target.value)} /></label>
      {canManage && <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>}
    </form>
  );
}

export function ProvisionPanel({ fy, computed, posted, ratesConfirmed, canPost }: { fy: string; computed: number | null; posted: number; ratesConfirmed: boolean; canPost: boolean }) {
  const { pending, run } = useRun();
  const inSync = computed !== null && Math.abs(computed - posted) < 0.01;
  return (
    <div className="space-y-2 text-sm">
      <p>In the books now: <strong>{formatMoney(posted)}</strong>. The working says: <strong>{computed === null ? "not known yet" : formatMoney(computed)}</strong>.{inSync ? " They agree." : ""}</p>
      {!ratesConfirmed && <p className="text-xs text-amber-700 dark:text-amber-400">The tax figures for this year are not confirmed yet (or no tax basis is chosen), so the tax cannot be put into the books yet.</p>}
      {canPost ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending || !ratesConfirmed || computed === null || inSync} onClick={() => run(() => postProvisionAction(fy), "Provision posted")}>{pending ? "Posting…" : posted > 0 ? "Update the provision" : "Put the tax into the books"}</Button>
          {posted > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => removeProvisionAction(fy), "Provision taken out")}>Take it out</Button>}
        </div>
      ) : <p className="text-xs text-muted-foreground">Only an administrator can post to the books.</p>}
      <p className="text-xs text-muted-foreground">This books the tax as an expense (Income tax expense) against a Provision for income tax. Setting advance tax and TDS credit against that provision when the return is filed is a journal your CA makes.</p>
    </div>
  );
}
