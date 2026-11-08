"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NOTICE_STATUS_LABEL, NOTICE_STATUSES, type NoticeStatus } from "@/lib/products/cashflow-ai/income-tax/registers-core";
import { addNoticeEventAction, saveNoticeAction, setNoticeStatusAction } from "@/app/(products)/cashflow-ai/(protected)/income-tax/returns/actions";

export interface NoticeRow {
  id: string;
  type: string;
  reference: string | null;
  fy: string | null;
  receivedOn: string;
  responseDueOn: string | null;
  status: NoticeStatus;
  amountDemanded: number | null;
  note: string | null;
  dueText: string | null;
  events: { id: string; date: string; text: string }[];
}

const dmy = (iso: string) => iso.split("-").reverse().join("-");
const sel = "mt-1 block h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground";

interface Form { type: string; reference: string; fy: string; receivedOn: string; responseDueOn: string; status: NoticeStatus; amountDemanded: string; note: string }
const EMPTY: Form = { type: "", reference: "", fy: "", receivedOn: "", responseDueOn: "", status: "open", amountDemanded: "", note: "" };

export default function NoticesManager({ notices, canManage, today }: { notices: NoticeRow[]; canManage: boolean; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [evFor, setEvFor] = useState<string | null>(null);
  const [ev, setEv] = useState({ date: today, text: "" });
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          after?.();
          router.refresh();
        } else toast.error(res.error);
      } catch {
        toast.error("Could not save. Please try again.");
      }
    });

  function edit(n: NoticeRow | null) {
    setEditing(n ? n.id : "new");
    setF(n ? { type: n.type, reference: n.reference ?? "", fy: n.fy ?? "", receivedOn: n.receivedOn, responseDueOn: n.responseDueOn ?? "", status: n.status, amountDemanded: n.amountDemanded === null ? "" : String(n.amountDemanded), note: n.note ?? "" } : { ...EMPTY, receivedOn: today });
  }
  const save = () =>
    run(() => saveNoticeAction(editing === "new" ? null : editing, { type: f.type.trim(), reference: f.reference.trim() || null, fy: f.fy.trim() || null, receivedOn: f.receivedOn, responseDueOn: f.responseDueOn || null, status: f.status, amountDemanded: f.amountDemanded.trim() === "" ? null : Number(f.amountDemanded), note: f.note.trim() || null }), () => { setEditing(null); toast.success("Saved."); });
  const addEvent = (id: string) => run(() => addNoticeEventAction(id, ev), () => { setEvFor(null); setEv({ date: today, text: "" }); toast.success("Added."); });

  return (
    <div className="space-y-3">
      {notices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notices recorded.</p>
      ) : (
        <ul className="space-y-3">
          {notices.map((n) => {
            const overdue = n.dueText?.startsWith("Overdue");
            return (
              <li key={n.id} className="space-y-2 rounded-lg border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{n.type}{n.reference ? <span className="font-normal text-muted-foreground"> · {n.reference}</span> : null}{n.fy ? <span className="font-normal text-muted-foreground"> · {n.fy}</span> : null}</p>
                    <p className="text-xs text-muted-foreground">
                      Received {dmy(n.receivedOn)}{n.responseDueOn ? ` · reply due ${dmy(n.responseDueOn)}` : ""}{n.amountDemanded !== null ? ` · demanded ₹${n.amountDemanded.toLocaleString("en-IN")}` : ""}
                    </p>
                    {n.note ? <p className="text-xs text-muted-foreground">{n.note}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium">{NOTICE_STATUS_LABEL[n.status]}</p>
                    {n.dueText && <p className={overdue ? "text-xs font-medium text-red-600 dark:text-red-400" : "text-xs text-muted-foreground"}>{n.dueText}</p>}
                  </div>
                </div>
                {n.events.length > 0 && (
                  <ul className="space-y-0.5 border-l border-border/60 pl-3 text-xs">
                    {n.events.map((e) => <li key={e.id}><span className="text-muted-foreground">{dmy(e.date)}</span> {e.text}</li>)}
                  </ul>
                )}
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Status" value={n.status} disabled={pending} onChange={(e) => run(() => setNoticeStatusAction(n.id, e.target.value))} className={`${sel} h-8`}>
                      {NOTICE_STATUSES.map((st) => <option key={st} value={st}>{NOTICE_STATUS_LABEL[st]}</option>)}
                    </select>
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setEvFor(evFor === n.id ? null : n.id); setEv({ date: today, text: "" }); }} disabled={pending}>Add an update</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => edit(n)} disabled={pending}>Edit details</Button>
                  </div>
                )}
                {canManage && evFor === n.id && (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs text-muted-foreground">Date<Input type="date" max={today} value={ev.date} onChange={(e) => setEv((p) => ({ ...p, date: e.target.value }))} className="mt-1 w-44" /></label>
                    <label className="min-w-64 flex-1 text-xs text-muted-foreground">What happened<Input value={ev.text} maxLength={1000} placeholder="e.g. Reply uploaded on the portal" onChange={(e) => setEv((p) => ({ ...p, text: e.target.value }))} className="mt-1" /></label>
                    <Button type="button" onClick={() => addEvent(n.id)} disabled={pending}>Add</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && editing === null && <Button type="button" variant="outline" onClick={() => edit(null)}>Add a notice</Button>}

      {canManage && editing !== null && (
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Kind of notice<Input value={f.type} placeholder="e.g. Intimation, Demand, Scrutiny" maxLength={80} onChange={(e) => set("type", e.target.value)} className="mt-1 w-64" /></label>
            <label className="text-xs text-muted-foreground">Section or reference (optional)<Input value={f.reference} maxLength={120} onChange={(e) => set("reference", e.target.value)} className="mt-1 w-56" /></label>
            <label className="text-xs text-muted-foreground">Financial year (optional)<Input value={f.fy} placeholder="2024-25" maxLength={7} onChange={(e) => set("fy", e.target.value)} className="mt-1 w-32" /></label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Received on<Input type="date" max={today} value={f.receivedOn} onChange={(e) => set("receivedOn", e.target.value)} className="mt-1 w-44" /></label>
            <label className="text-xs text-muted-foreground">Reply due on (from the notice)<Input type="date" value={f.responseDueOn} onChange={(e) => set("responseDueOn", e.target.value)} className="mt-1 w-44" /></label>
            <label className="text-xs text-muted-foreground">Status
              <select value={f.status} onChange={(e) => set("status", e.target.value as NoticeStatus)} className={`${sel} w-40`}>
                {NOTICE_STATUSES.map((st) => <option key={st} value={st}>{NOTICE_STATUS_LABEL[st]}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Amount demanded, ₹ (optional)<Input type="number" min={0} step="any" value={f.amountDemanded} onChange={(e) => set("amountDemanded", e.target.value)} className="mt-1 w-44" /></label>
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
