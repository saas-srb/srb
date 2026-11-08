"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { RateEntry, RateKind } from "@/lib/products/talentos/payroll/rates-store";
import { confirmRateAction, rateHistoryAction, resetRateAction, saveRateAction } from "./actions";

const GROUPS: { kind: RateKind; title: string; hint: string }[] = [
  { kind: "income_tax", title: "Income tax", hint: "Slabs, rebate, surcharge, cess, standard deduction, per financial year." },
  { kind: "statutory", title: "PF, ESI, gratuity, bonus, leave encashment", hint: "Ceilings, rates and limits set by the Acts." },
  { kind: "pt", title: "Professional tax", hint: "State slabs. Each state notifies its own." },
  { kind: "lwf", title: "Labour welfare fund", hint: "State rates. None are pre-loaded: add the ones your companies need." },
];

export default function RatesManager({ entries, canEdit }: { entries: RateEntry[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<RateEntry | null>(null);
  const [adding, setAdding] = useState<RateKind | null>(null);
  const [newKey, setNewKey] = useState("");
  const [json, setJson] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [history, setHistory] = useState<{ at: string; by: string; action: string }[]>([]);

  function edit(e: RateEntry) {
    setOpen(e);
    setAdding(null);
    setJson(JSON.stringify(e.data, null, 2));
    setErrors([]);
    setHistory([]);
    rateHistoryAction(e.kind, e.key).then(setHistory);
  }
  function add(kind: RateKind) {
    setOpen(null);
    setAdding(kind);
    setNewKey("");
    setJson(kind === "lwf" ? '{\n  "state": "",\n  "confirmed": false,\n  "source": ""\n}' : "{}");
    setErrors([]);
    setHistory([]);
  }
  const target = open ? { kind: open.kind, key: open.key } : adding ? { kind: adding, key: newKey.trim() } : null;

  function run(fn: () => Promise<{ ok: true } | { ok: false; errors: string[] }>, done: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.errors);
        toast.error(r.errors[0] ?? "Could not save.");
        return;
      }
      toast.success(done);
      setOpen(null);
      setAdding(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <section key={g.kind} className="rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-2 border-b p-4">
            <div>
              <h2 className="text-sm font-semibold">{g.title}</h2>
              <p className="text-xs text-muted-foreground">{g.hint}</p>
            </div>
            {canEdit && (g.kind === "lwf" || g.kind === "pt" || g.kind === "income_tax") && <Button size="sm" variant="outline" onClick={() => add(g.kind)}>Add table</Button>}
          </div>
          <ul className="divide-y">
            {entries.filter((e) => e.kind === g.kind).length === 0 && <li className="p-4 text-sm text-muted-foreground">Nothing here yet.</li>}
            {entries.filter((e) => e.kind === g.kind).map((e) => (
              <li key={`${e.kind}-${e.key}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{e.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.note || "No source recorded."}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{e.source === "published" ? `Published v${e.version}` : "Built-in"}</Badge>
                  {e.confirmed ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Confirmed</Badge> : <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">Not confirmed</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => edit(e)}>{canEdit ? "Edit" : "View"}</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Sheet open={!!(open || adding)} onOpenChange={(o) => !o && (setOpen(null), setAdding(null))}>
        <SheetContent className="sm:max-w-2xl">
          <SheetHeader className="border-b border-border/60">
            <SheetTitle>{open ? open.label : "New table"}</SheetTitle>
            <SheetDescription>
              {open?.confirmedBy ? `Confirmed by ${open.confirmedBy}${open.confirmedAt ? ` on ${new Date(open.confirmedAt).toLocaleDateString("en-IN")}` : ""}. ` : ""}
              Check every figure against the official notification before confirming. Payslips made on a table that is not confirmed say so.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {adding && (
              <div className="space-y-1">
                <label className="text-sm font-medium">{adding === "income_tax" ? "Financial year (for example 2027-28)" : "State"}</label>
                <input className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
              </div>
            )}
            <textarea className="min-h-96 w-full rounded-md border border-input bg-transparent p-3 font-mono text-xs" spellCheck={false} readOnly={!canEdit} value={json} onChange={(e) => setJson(e.target.value)} />
            {errors.length > 0 && (
              <ul className="list-disc space-y-1 rounded-md bg-destructive/10 p-3 pl-6 text-xs text-destructive">{errors.map((x) => <li key={x}>{x}</li>)}</ul>
            )}
            {canEdit && target && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={pending || !target.key} onClick={() => run(() => saveRateAction(target.kind, target.key, json, false), "Saved, not yet confirmed")}>Save as unconfirmed</Button>
                <Button disabled={pending || !target.key} onClick={() => run(() => saveRateAction(target.kind, target.key, json, true), "Saved and confirmed")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Save and confirm"}</Button>
                {open && !open.confirmed && open.source === "built-in" && <Button variant="outline" disabled={pending} onClick={() => run(() => confirmRateAction(open.kind, open.key), "Confirmed")}>Confirm as is</Button>}
                {open?.source === "published" && <Button variant="ghost" disabled={pending} onClick={() => run(() => resetRateAction(open.kind, open.key), "Back to the built-in table")}>Reset to built-in</Button>}
              </div>
            )}
            {history.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">History</p>
                <ul className="space-y-0.5">{history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("en-IN")}: {h.action} by {h.by}</li>)}</ul>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
