"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { JurisdictionSummary, LoadedJurisdiction } from "@/lib/products/contractflow-ai/stamp/store";
import {
  DUTY_TYPES,
  DUTY_TYPE_LABEL,
  ESTAMP_LABEL,
  ESTAMP_VALUES,
  INSTRUMENT_CATEGORIES,
  JURISDICTIONS,
  blankContent,
  categoryLabel,
  contentOf,
  type StampEntryContent,
} from "@/lib/products/contractflow-ai/stamp/structure";
import { confirmEntryAction, copyEntriesAction, historyAction, removeEntryAction, saveEntryAction, unconfirmEntryAction } from "./actions";

const input = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm";
type Entry = LoadedJurisdiction["entries"][number];
type Result = { ok: true } | { ok: false; errors: string[] };

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));
const txt = (v: number | null) => (v === null ? "" : String(v));
const inr = (n: number | null) => (n === null ? "not entered" : `₹${n.toLocaleString("en-IN")}`);

function describe(e: Entry): string {
  if (e.dutyType === "not_entered") return "Not entered";
  if (e.dutyType === "exempt") return "Exempt";
  if (e.dutyType === "fixed") return `Fixed ${inr(e.fixedAmount)}`;
  return `${e.ratePercent === null ? "rate not entered" : `${e.ratePercent}%`}${e.rateBasis ? ` ${e.rateBasis}` : ""}${e.minAmount !== null ? `, minimum ${inr(e.minAmount)}` : ""}${e.capAmount !== null ? `, cap ${inr(e.capAmount)}` : ""}`;
}

function Status({ e }: { e: Entry }) {
  return e.status === "confirmed" ? (
    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Confirmed by {e.confirmation?.by} on {e.confirmation ? new Date(e.confirmation.on).toLocaleDateString("en-IN") : ""}</Badge>
  ) : (
    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">NOT CONFIRMED</Badge>
  );
}

export default function StampRulebookManager({ summaries, selected, canEdit, canConfirm }: { summaries: JurisdictionSummary[]; selected: LoadedJurisdiction | null; canEdit: boolean; canConfirm: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ id: string | null; content: StampEntryContent } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [history, setHistory] = useState<{ at: string; by: string; action: string; detail: string }[] | null>(null);
  const [copyFrom, setCopyFrom] = useState("");

  function run(fn: () => Promise<Result>, ok: string, closeEdit = false) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.errors);
        toast.error(r.errors[0] ?? "Could not save.");
        return;
      }
      toast.success(ok);
      setErrors([]);
      setHistory(null);
      if (closeEdit) setEditing(null);
      router.refresh();
    });
  }

  const code = selected?.jurisdiction.code ?? "";
  const version = selected?.version ?? 0;
  const set = (p: Partial<StampEntryContent>) => setEditing((x) => (x ? { ...x, content: { ...x.content, ...p } } : x));

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <section className="rounded-lg border bg-card">
        <div className="border-b p-3 text-sm font-semibold">States and union territories</div>
        <ul className="max-h-[70vh] divide-y overflow-y-auto text-sm">
          {(["state", "ut"] as const).map((kind) => (
            <li key={kind}>
              <p className="bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">{kind === "state" ? "States" : "Union territories"}</p>
              <ul className="divide-y">
                {summaries.filter((s) => s.jurisdiction.kind === kind).map((s) => (
                  <li key={s.jurisdiction.code}>
                    <Link href={`/console/stamp-rulebook?state=${s.jurisdiction.code}`} className={`flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40 ${s.jurisdiction.code === code ? "bg-muted/60" : ""}`}>
                      <span>{s.jurisdiction.name}</span>
                      <span className="text-xs text-muted-foreground">{s.entries === 0 ? "none" : `${s.confirmed}/${s.entries}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Choose a state or union territory. The figure beside each is entries confirmed out of entries entered.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">{selected.jurisdiction.name}</h2>
                <p className="text-xs text-muted-foreground">{selected.origin === "published" ? `Last changed by ${selected.updatedBy} on ${selected.updatedAt ? new Date(selected.updatedAt).toLocaleString("en-IN") : ""}` : "Structure only: nothing has been entered for this state."}</p>
              </div>
              <Button variant="ghost" onClick={() => historyAction(code).then(setHistory)}>History</Button>
            </div>

            {canEdit && !editing && (
              <div className="flex flex-wrap items-end gap-2 text-xs">
                <label>Copy entries from another state as unconfirmed drafts
                  <select className={`${input} mt-1`} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                    <option value="">Choose a state</option>
                    {JURISDICTIONS.filter((j) => j.code !== code && (summaries.find((s) => s.jurisdiction.code === j.code)?.entries ?? 0) > 0).map((j) => <option key={j.code} value={j.code}>{j.name}</option>)}
                  </select>
                </label>
                <Button size="sm" variant="outline" disabled={!copyFrom || pending} onClick={() => run(() => copyEntriesAction(copyFrom, code, version), "Copied as unconfirmed drafts")}>Copy</Button>
              </div>
            )}

            {errors.length > 0 && <ul className="list-disc space-y-1 rounded-md bg-destructive/10 p-3 pl-6 text-xs text-destructive">{errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            {history && (
              <div className="text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">History</p>
                {history.length === 0 ? <p>Nothing has been recorded for this state yet.</p> : <ul className="space-y-0.5">{history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("en-IN")}: {h.action} by {h.by} ({h.detail})</li>)}</ul>}
              </div>
            )}

            {editing && (
              <div className="space-y-3 rounded-md border p-3">
                <h3 className="text-sm font-semibold">{editing.id ? "Edit entry" : "New entry"}: {categoryLabel(editing.content.category)}</h3>
                <p className="text-xs text-muted-foreground">Leave an amount empty when you do not have it. Saving never confirms an entry; changing a confirmed entry removes its confirmation.</p>
                <div className="grid gap-2 sm:grid-cols-6">
                  <label className="text-xs sm:col-span-3">Instrument category
                    <select className={input} value={editing.content.category} onChange={(e) => set({ category: e.target.value })}>
                      {INSTRUMENT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select></label>
                  <label className="text-xs sm:col-span-3">Title (for example the Article or Schedule item)<input className={input} value={editing.content.title} onChange={(e) => set({ title: e.target.value })} /></label>
                  <label className="text-xs sm:col-span-2">Duty type
                    <select className={input} value={editing.content.dutyType} onChange={(e) => set({ dutyType: e.target.value as StampEntryContent["dutyType"] })}>
                      {DUTY_TYPES.map((d) => <option key={d} value={d}>{DUTY_TYPE_LABEL[d]}</option>)}
                    </select></label>
                  <label className="text-xs sm:col-span-2">Fixed amount (₹)<input className={input} inputMode="decimal" value={txt(editing.content.fixedAmount)} onChange={(e) => set({ fixedAmount: num(e.target.value) })} /></label>
                  <label className="text-xs sm:col-span-2">Rate (%)<input className={input} inputMode="decimal" value={txt(editing.content.ratePercent)} onChange={(e) => set({ ratePercent: num(e.target.value) })} /></label>
                  <label className="text-xs sm:col-span-3">What the rate applies to (as the Act words it)<input className={input} value={editing.content.rateBasis} onChange={(e) => set({ rateBasis: e.target.value })} /></label>
                  <label className="text-xs">Minimum (₹)<input className={input} inputMode="decimal" value={txt(editing.content.minAmount)} onChange={(e) => set({ minAmount: num(e.target.value) })} /></label>
                  <label className="text-xs">Cap (₹)<input className={input} inputMode="decimal" value={txt(editing.content.capAmount)} onChange={(e) => set({ capAmount: num(e.target.value) })} /></label>
                  <label className="text-xs sm:col-span-6">Exemptions<textarea className={`${input} h-16 py-1`} value={editing.content.exemptions} onChange={(e) => set({ exemptions: e.target.value })} /></label>
                  <label className="text-xs sm:col-span-6">Notes<textarea className={`${input} h-16 py-1`} value={editing.content.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
                  <label className="text-xs sm:col-span-3">Source link (the Act or notification, https://)<input className={input} value={editing.content.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} /></label>
                  <label className="text-xs sm:col-span-3">Source name<input className={input} value={editing.content.sourceTitle} onChange={(e) => set({ sourceTitle: e.target.value })} /></label>
                  <label className="text-xs sm:col-span-3">Applies from<input type="date" className={input} value={editing.content.effectiveFrom ?? ""} onChange={(e) => set({ effectiveFrom: e.target.value || null })} /></label>
                  <label className="text-xs sm:col-span-3">E-stamping
                    <select className={input} value={editing.content.eStamp} onChange={(e) => set({ eStamp: e.target.value as StampEntryContent["eStamp"] })}>
                      {ESTAMP_VALUES.map((v) => <option key={v} value={v}>{ESTAMP_LABEL[v]}</option>)}
                    </select></label>
                </div>
                <div className="flex gap-2">
                  <Button disabled={pending} onClick={() => run(() => saveEntryAction(code, editing.id, editing.content, version), "Saved, not confirmed", true)}>Save</Button>
                  <Button variant="ghost" disabled={pending} onClick={() => { setEditing(null); setErrors([]); }}>Cancel</Button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {INSTRUMENT_CATEGORIES.map((c) => {
                const rows = selected.entries.filter((e) => e.category === c.key);
                return (
                  <div key={c.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{c.label}</h3>
                      {canEdit && !editing && <Button size="sm" variant="outline" onClick={() => { setEditing({ id: null, content: blankContent(c.key) }); setErrors([]); }}>Add entry</Button>}
                    </div>
                    {rows.length === 0 ? (
                      <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">Not entered</p>
                    ) : (
                      <ul className="divide-y rounded-md border">
                        {rows.map((e) => (
                          <li key={e.id} className="space-y-1 p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium">{e.title || c.label}: {describe(e)}</p>
                              <Status e={e} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {e.effectiveFrom ? `Applies from ${e.effectiveFrom}. ` : "Start date not entered. "}E-stamping: {ESTAMP_LABEL[e.eStamp]}.{" "}
                              {e.sourceUrl ? <a className="underline" href={e.sourceUrl} target="_blank" rel="noopener noreferrer">{e.sourceTitle || "Source"}</a> : "No source entered."}
                            </p>
                            {e.exemptions && <p className="text-xs">Exemptions: {e.exemptions}</p>}
                            {e.notes && <p className="text-xs">Notes: {e.notes}</p>}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {canEdit && !editing && <Button size="sm" variant="outline" onClick={() => { setEditing({ id: e.id, content: contentOf(e) }); setErrors([]); }}>Edit</Button>}
                              {canConfirm && e.status !== "confirmed" && <Button size="sm" disabled={pending} onClick={() => run(() => confirmEntryAction(code, e.id, version), "Confirmed")}>Confirm</Button>}
                              {canConfirm && e.status === "confirmed" && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => unconfirmEntryAction(code, e.id, version), "Confirmation removed")}>Remove confirmation</Button>}
                              {canEdit && <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm("Remove this entry?")) run(() => removeEntryAction(code, e.id, version), "Removed"); }}>Remove</Button>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {selected.entries.filter((e) => !INSTRUMENT_CATEGORIES.some((c) => c.key === e.category)).length > 0 && <p className="text-xs text-muted-foreground">Some entries use a category that is no longer in the list; they are kept but not shown here.</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
