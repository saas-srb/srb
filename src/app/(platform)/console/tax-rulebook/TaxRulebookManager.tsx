"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { calendarFor, type RulebookEntry } from "@/lib/products/cashflow-ai/rulebook/rules";
import { cloneRulebookForYear } from "./clone";
import { CATEGORIES, CATEGORY_LABEL, describeWhen, rulebookToForm, type DueForm, type RulebookForm } from "./form";
import { confirmRulebookAction, resetRulebookAction, rulebookHistoryAction, saveRulebookAction } from "./actions";

const inr = (n: number | null) => (n === null ? "None" : `₹${n.toLocaleString("en-IN")}`);
const pc = (n: number | null) => (n === null ? "None" : `${n}%`);
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const input = "h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm";
const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const td = "px-3 py-2 align-top";

const BLANK_DUE: DueForm = { id: "", name: "", form: "", category: "other", kind: "monthly", day: "", monthsAfter: "1", month: "", fyOffset: "1", dates: [] };

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40"><tr>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

function StatusBadges({ e }: { e: Pick<RulebookEntry, "origin" | "confirmed" | "confirmedBy" | "confirmedAt"> }) {
  return (
    <>
      <Badge variant="outline">{e.origin === "published" ? "Published" : "Built-in starting table"}</Badge>
      {e.confirmed ? (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Confirmed by {e.confirmedBy}{e.confirmedAt ? ` on ${new Date(e.confirmedAt).toLocaleDateString("en-IN")}` : ""}</Badge>
      ) : (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">NOT CONFIRMED — check against the current notification</Badge>
      )}
    </>
  );
}

export default function TaxRulebookManager({ entries, currentFy, canEdit }: { entries: RulebookEntry[]; currentFy: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fy, setFy] = useState<string | null>(null);
  const [form, setForm] = useState<RulebookForm | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [history, setHistory] = useState<{ at: string; by: string; action: string }[] | null>(null);

  const entry = entries.find((e) => e.fy === fy) ?? null;
  const previous = entry ? entries.find((e) => e.fy === `${Number(entry.fy.slice(0, 4)) - 1}-${entry.fy.slice(2, 4)}`) : undefined;
  const calendar = useMemo(() => (entry ? calendarFor(entry) : []), [entry]);

  function open(e: RulebookEntry) {
    setFy(e.fy);
    setForm(null);
    setErrors([]);
    setHistory(null);
  }
  function run(fn: () => Promise<{ ok: true } | { ok: false; errors: string[] }>, done: string, leaveEdit = true) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setErrors(r.errors);
        toast.error(r.errors[0] ?? "Could not save.");
        return;
      }
      toast.success(done);
      setErrors([]);
      if (leaveEdit) setForm(null);
      setHistory(null);
      router.refresh();
    });
  }
  function showHistory() {
    if (entry) rulebookHistoryAction(entry.fy).then(setHistory);
  }
  function copyLast() {
    if (!entry || !previous) return;
    const { confirmed, confirmedAt, confirmedBy, origin, ...rb } = previous;
    void confirmed; void confirmedAt; void confirmedBy; void origin;
    setForm(rulebookToForm(cloneRulebookForYear(rb, entry.fy)));
    setErrors([]);
    toast.message(`Copied FY ${previous.fy} into the form. Nothing is saved until you save it, and it will be unconfirmed.`);
  }

  // Small immutable updaters for the form's lists.
  const patch = <K extends keyof RulebookForm>(k: K, fn: (rows: RulebookForm[K]) => RulebookForm[K]) => setForm((f) => (f ? { ...f, [k]: fn(f[k]) } : f));
  const setRow = <T,>(rows: T[], i: number, p: Partial<T>) => rows.map((r, j) => (j === i ? { ...r, ...p } : r));
  const drop = <T,>(rows: T[], i: number) => rows.filter((_, j) => j !== i);
  const Remove = ({ onClick }: { onClick: () => void }) => <Button type="button" size="sm" variant="ghost" onClick={onClick}>Remove</Button>;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-sm font-semibold">Financial years</h2>
          <p className="text-xs text-muted-foreground">The current year is {currentFy}. A year with no published table uses the built-in starting table, which is never treated as checked.</p>
        </div>
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.fy} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
              <div className="min-w-0">
                <p className="font-medium">FY {e.fy}{e.fy === currentFy ? " (current)" : ""}</p>
                <p className="truncate text-xs text-muted-foreground">{e.source}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadges e={e} />
                <Button size="sm" variant={fy === e.fy ? "secondary" : "ghost"} onClick={() => open(e)}>{fy === e.fy ? "Open" : canEdit ? "Open" : "View"}</Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {entry && (
        <section className="space-y-5 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">FY {entry.fy}</h2>
              <p className="text-xs text-muted-foreground">Source: {entry.source}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2"><StatusBadges e={entry} /></div>
          </div>

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {!form && <Button variant="outline" onClick={() => { setForm(rulebookToForm(entry)); setErrors([]); }}>Edit</Button>}
              {!form && previous && <Button variant="outline" onClick={copyLast}>Copy last year into this year</Button>}
              {!form && !entry.confirmed && <Button disabled={pending} onClick={() => run(() => confirmRulebookAction(entry.fy), "Confirmed")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Confirm as is"}</Button>}
              {!form && entry.origin === "published" && <Button variant="ghost" disabled={pending} onClick={() => { if (confirm("Go back to the built-in starting table for this year? Your published figures will be removed.")) run(() => resetRulebookAction(entry.fy), "Back to the built-in table"); }}>Reset to built-in</Button>}
              {form && <Button variant="outline" disabled={pending} onClick={() => run(() => saveRulebookAction(entry.fy, form, false), "Saved, not yet confirmed", false)}>Save</Button>}
              {form && <Button disabled={pending} onClick={() => run(() => saveRulebookAction(entry.fy, form, true), "Saved and confirmed")}>{pending ? <Loader2 className="size-4 animate-spin" /> : "Save and confirm"}</Button>}
              {form && <Button variant="ghost" disabled={pending} onClick={() => { setForm(null); setErrors([]); }}>Cancel</Button>}
              <Button variant="ghost" onClick={showHistory}>History</Button>
            </div>
          )}
          {!canEdit && <Button variant="ghost" onClick={showHistory}>History</Button>}

          {errors.length > 0 && <ul className="list-disc space-y-1 rounded-md bg-destructive/10 p-3 pl-6 text-xs text-destructive">{errors.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {history && (
            <div className="text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">History</p>
              {history.length === 0 ? <p>Nothing published for this year yet.</p> : <ul className="space-y-0.5">{history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString("en-IN")}: {h.action} by {h.by}</li>)}</ul>}
            </div>
          )}

          {!form ? (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">TDS sections</h3>
                <Table head={["Section", "Name", "Rate", "Rate with no PAN", "Single payment limit", "Yearly limit"]}>
                  {entry.tds.map((r) => (
                    <tr key={r.code}>
                      <td className={`${td} font-medium`}>{r.code}</td>
                      <td className={td}>{r.label}<p className="text-xs text-muted-foreground">{r.covers}</p></td>
                      <td className={td}>{pc(r.rate)}</td><td className={td}>{pc(r.noPanRate)}</td><td className={td}>{inr(r.singleThreshold)}</td><td className={td}>{inr(r.annualThreshold)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Company income-tax bases</h3>
                <Table head={["Name", "Who it suits", "Rate", "Surcharge", "Cess", "MAT"]}>
                  {entry.regimes.map((r) => (
                    <tr key={r.id}>
                      <td className={`${td} font-medium`}>{r.label}<p className="text-xs font-normal text-muted-foreground">{r.id}</p></td>
                      <td className={td}>{r.who}</td>
                      <td className={td}>{pc(r.baseRate)}</td>
                      <td className={td}>{r.surchargeSlabs.length === 0 ? "None" : r.surchargeSlabs.map((s) => <p key={s.above}>{s.rate}% when income is above {inr(s.above)}</p>)}</td>
                      <td className={td}>{pc(r.cessRate)}</td><td className={td}>{r.matRate === null ? "Not paid" : `${r.matRate}% of book profit`}</td>
                    </tr>
                  ))}
                </Table>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Advance-tax instalments</h3>
                <Table head={["Due date", "Cumulative share of the year's tax"]}>
                  {entry.advanceTax.map((i) => <tr key={i.dueDate}><td className={td}>{day(i.dueDate)}</td><td className={td}>{i.cumulativePercent}%</td></tr>)}
                </Table>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Due-date rules</h3>
                <Table head={["Name", "Form", "Rule"]}>
                  {entry.dueRules.map((r) => <tr key={r.id}><td className={td}>{r.name}<p className="text-xs text-muted-foreground">{CATEGORY_LABEL[r.category]}</p></td><td className={td}>{r.form ?? "None"}</td><td className={td}>{describeWhen(r.when)}</td></tr>)}
                </Table>
              </div>
              <details className="space-y-2">
                <summary className="cursor-pointer text-sm font-semibold">Calendar these rules give for FY {entry.fy} ({calendar.length} dates)</summary>
                <div className="mt-2 max-h-96 overflow-y-auto">
                  <Table head={["Due date", "What", "For"]}>
                    {calendar.map((c, i) => <tr key={i}><td className={td}>{day(c.dueDate)}</td><td className={td}>{c.name}{c.form ? ` (${c.form})` : ""}</td><td className={td}>{c.period}</td></tr>)}
                  </Table>
                </div>
              </details>
            </>
          ) : (
            <div className="space-y-6">
              <div className="space-y-1">
                <label className="text-sm font-medium">Source (the Act or notification you used) *</label>
                <input className={input} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="For example: Finance Act 2026; CBDT notification no. … dated …" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">TDS sections</h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => patch("tds", (r) => [...r, { code: "", label: "", covers: "", rate: "", noPanRate: "", singleThreshold: "", annualThreshold: "" }])}>Add section</Button></div>
                <p className="text-xs text-muted-foreground">Leave the no-PAN rate or a limit empty when there is none.</p>
                {form.tds.map((r, i) => (
                  <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                    <label className="text-xs">Section<input className={input} value={r.code} onChange={(e) => patch("tds", (rows) => setRow(rows, i, { code: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-5">Name<input className={input} value={r.label} onChange={(e) => patch("tds", (rows) => setRow(rows, i, { label: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-6">What it covers<input className={input} value={r.covers} onChange={(e) => patch("tds", (rows) => setRow(rows, i, { covers: e.target.value }))} /></label>
                    <label className="text-xs">Rate (%)<input className={input} inputMode="decimal" value={r.rate} onChange={(e) => patch("tds", (rows) => setRow(rows, i, { rate: e.target.value }))} /></label>
                    <label className="text-xs">No-PAN rate (%)<input className={input} inputMode="decimal" value={r.noPanRate} onChange={(e) => patch("tds", (rows) => setRow(rows, i, { noPanRate: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-2">Single payment limit (₹)<input className={input} inputMode="decimal" value={r.singleThreshold} onChange={(e) => patch("tds", (rows) => setRow(rows, i, { singleThreshold: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-2">Yearly limit (₹)<input className={input} inputMode="decimal" value={r.annualThreshold} onChange={(e) => patch("tds", (rows) => setRow(rows, i, { annualThreshold: e.target.value }))} /></label>
                    <div className="sm:col-span-6"><Remove onClick={() => patch("tds", (rows) => drop(rows, i))} /></div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Company income-tax bases</h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => patch("regimes", (r) => [...r, { id: "", label: "", who: "", baseRate: "", cessRate: "", matRate: "", slabs: [] }])}>Add basis</Button></div>
                {form.regimes.map((r, i) => (
                  <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                    <label className="text-xs sm:col-span-2">Id (lower-case letters, digits, dashes)<input className={input} value={r.id} onChange={(e) => patch("regimes", (rows) => setRow(rows, i, { id: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-4">Name<input className={input} value={r.label} onChange={(e) => patch("regimes", (rows) => setRow(rows, i, { label: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-6">Who it suits<input className={input} value={r.who} onChange={(e) => patch("regimes", (rows) => setRow(rows, i, { who: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-2">Rate (%)<input className={input} inputMode="decimal" value={r.baseRate} onChange={(e) => patch("regimes", (rows) => setRow(rows, i, { baseRate: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-2">Cess (%)<input className={input} inputMode="decimal" value={r.cessRate} onChange={(e) => patch("regimes", (rows) => setRow(rows, i, { cessRate: e.target.value }))} /></label>
                    <label className="text-xs sm:col-span-2">MAT (% of book profit, empty = none)<input className={input} inputMode="decimal" value={r.matRate} onChange={(e) => patch("regimes", (rows) => setRow(rows, i, { matRate: e.target.value }))} /></label>
                    <div className="space-y-1 sm:col-span-6">
                      <p className="text-xs font-medium">Surcharge slabs (income going up; empty = no surcharge)</p>
                      {r.slabs.map((s, j) => (
                        <div key={j} className="flex flex-wrap items-end gap-2">
                          <label className="text-xs">Income above (₹)<input className={input} inputMode="decimal" value={s.above} onChange={(e) => patch("regimes", (rows) => setRow(rows, i, { slabs: setRow(r.slabs, j, { above: e.target.value }) }))} /></label>
                          <label className="text-xs">Surcharge (%)<input className={input} inputMode="decimal" value={s.rate} onChange={(e) => patch("regimes", (rows) => setRow(rows, i, { slabs: setRow(r.slabs, j, { rate: e.target.value }) }))} /></label>
                          <Remove onClick={() => patch("regimes", (rows) => setRow(rows, i, { slabs: drop(r.slabs, j) }))} />
                        </div>
                      ))}
                      <Button type="button" size="sm" variant="outline" onClick={() => patch("regimes", (rows) => setRow(rows, i, { slabs: [...r.slabs, { above: "", rate: "" }] }))}>Add slab</Button>
                    </div>
                    <div className="sm:col-span-6"><Remove onClick={() => patch("regimes", (rows) => drop(rows, i))} /></div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Advance-tax instalments</h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => patch("advanceTax", (r) => [...r, { dueDate: "", cumulativePercent: "" }])}>Add instalment</Button></div>
                {form.advanceTax.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <label className="text-xs">Due date<input type="date" className={input} value={r.dueDate} onChange={(e) => patch("advanceTax", (rows) => setRow(rows, i, { dueDate: e.target.value }))} /></label>
                    <label className="text-xs">Cumulative share of the year&apos;s tax (%)<input className={input} inputMode="decimal" value={r.cumulativePercent} onChange={(e) => patch("advanceTax", (rows) => setRow(rows, i, { cumulativePercent: e.target.value }))} /></label>
                    <Remove onClick={() => patch("advanceTax", (rows) => drop(rows, i))} />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Due-date rules</h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => patch("dueRules", (r) => [...r, { ...BLANK_DUE }])}>Add rule</Button></div>
                {form.dueRules.map((r, i) => {
                  const set = (p: Partial<DueForm>) => patch("dueRules", (rows) => setRow(rows, i, p));
                  return (
                    <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
                      <label className="text-xs sm:col-span-2">Id<input className={input} value={r.id} onChange={(e) => set({ id: e.target.value })} /></label>
                      <label className="text-xs sm:col-span-4">Name<input className={input} value={r.name} onChange={(e) => set({ name: e.target.value })} /></label>
                      <label className="text-xs sm:col-span-3">Form (optional)<input className={input} value={r.form} onChange={(e) => set({ form: e.target.value })} /></label>
                      <label className="text-xs sm:col-span-3">Group
                        <select className={input} value={r.category} onChange={(e) => set({ category: e.target.value as DueForm["category"] })}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
                      <label className="text-xs sm:col-span-2">How the date is set
                        <select className={input} value={r.kind} onChange={(e) => set({ kind: e.target.value as DueForm["kind"] })}>
                          <option value="monthly">Every month</option><option value="quarterly">Every quarter</option><option value="yearly">Once a year</option><option value="dates">Exact dates</option>
                        </select></label>
                      {(r.kind === "monthly" || r.kind === "quarterly") && (<>
                        <label className="text-xs sm:col-span-2">Day of month<input className={input} inputMode="numeric" value={r.day} onChange={(e) => set({ day: e.target.value })} /></label>
                        <label className="text-xs sm:col-span-2">Months after the {r.kind === "monthly" ? "month" : "quarter"} ends<input className={input} inputMode="numeric" value={r.monthsAfter} onChange={(e) => set({ monthsAfter: e.target.value })} /></label>
                      </>)}
                      {r.kind === "yearly" && (<>
                        <label className="text-xs">Month (1 to 12)<input className={input} inputMode="numeric" value={r.month} onChange={(e) => set({ month: e.target.value })} /></label>
                        <label className="text-xs">Day<input className={input} inputMode="numeric" value={r.day} onChange={(e) => set({ day: e.target.value })} /></label>
                        <label className="text-xs sm:col-span-2">Falls in
                          <select className={input} value={r.fyOffset} onChange={(e) => set({ fyOffset: e.target.value as "0" | "1" })}><option value="0">The year the financial year starts</option><option value="1">The year after it starts</option></select></label>
                      </>)}
                      {r.kind === "dates" && (
                        <div className="space-y-1 sm:col-span-6">
                          {r.dates.map((d, j) => (
                            <div key={j} className="flex items-end gap-2">
                              <input type="date" className={`${input} max-w-48`} value={d} onChange={(e) => set({ dates: r.dates.map((x, k) => (k === j ? e.target.value : x)) })} />
                              <Remove onClick={() => set({ dates: drop(r.dates, j) })} />
                            </div>
                          ))}
                          <Button type="button" size="sm" variant="outline" onClick={() => set({ dates: [...r.dates, ""] })}>Add date</Button>
                        </div>
                      )}
                      <div className="sm:col-span-6"><Remove onClick={() => patch("dueRules", (rows) => drop(rows, i))} /></div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
