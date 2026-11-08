"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ITEM_STATUSES, type ItemStatus } from "@/lib/products/cashflow-ai/compliance/catalog";
import { saveChecklistItemAction } from "@/app/(products)/cashflow-ai/(protected)/compliance/actions";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<ItemStatus, string> = {
  todo: "border-border text-foreground",
  in_progress: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  done: "border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400",
  not_applicable: "border-border bg-muted text-muted-foreground",
};

export default function ChecklistItemRow({
  itemKey,
  title,
  status: initialStatus,
  owner: initialOwner,
  note: initialNote,
  canManage,
  signal,
}: {
  itemKey: string;
  title: string;
  status: ItemStatus;
  owner: string;
  note: string;
  canManage: boolean;
  /** What the books show about this item, when they can show anything. */
  signal?: { state: "verified" | "issue"; detail: string };
}) {
  const [status, setStatus] = useState(initialStatus);
  const [owner, setOwner] = useState(initialOwner);
  const [note, setNote] = useState(initialNote);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function save(patch: { status?: string; owner?: string; note?: string }, undo: () => void) {
    start(async () => {
      try {
        const res = await saveChecklistItemAction(itemKey, patch);
        if (!res.ok) {
          undo();
          toast.error(res.error);
        }
      } catch {
        undo();
        toast.error("Could not save. Please try again.");
      }
    });
  }

  return (
    <li className="border-b border-border/40 py-2.5 last:border-0">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left text-sm leading-snug hover:text-primary" aria-expanded={open}>
          <span className={cn(status === "done" && "text-muted-foreground line-through", status === "not_applicable" && "text-muted-foreground")}>{title}</span>
          {(owner || note) && !open && <span className="ml-2 text-xs text-muted-foreground">{owner ? `· ${owner}` : ""}{note ? " · note" : ""}</span>}
        </button>
        <select
          aria-label={`Status of: ${title}`}
          value={status}
          disabled={!canManage || pending}
          onChange={(e) => {
            const prev = status;
            const next = e.target.value as ItemStatus;
            setStatus(next);
            save({ status: next }, () => setStatus(prev));
          }}
          className={cn("h-8 rounded-lg border px-2 text-xs font-medium disabled:opacity-70", STATUS_STYLE[status])}
        >
          {ITEM_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      {signal && (
        <div className={cn("mt-1.5 flex flex-wrap items-center gap-2 text-xs", signal.state === "issue" ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400")}>
          <span>{signal.state === "issue" ? "⚠ Books show a problem: " : "✓ Books confirm: "}{signal.detail}{signal.state === "issue" && status === "done" ? " This is marked Done — please re-check." : ""}</span>
          {signal.state === "verified" && status !== "done" && canManage && (
            <button
              type="button"
              disabled={pending}
              className="rounded-md border border-green-500/50 px-2 py-0.5 hover:bg-green-500/10"
              onClick={() => {
                const prev = status;
                setStatus("done");
                save({ status: "done" }, () => setStatus(prev));
              }}
            >
              Mark done
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">
            Who is responsible
            <input
              value={owner}
              disabled={!canManage}
              maxLength={120}
              onChange={(e) => setOwner(e.target.value)}
              onBlur={() => owner !== initialOwner && save({ owner }, () => setOwner(initialOwner))}
              placeholder="e.g. Priya (accounts) or our CA"
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Note / where the proof is saved
            <input
              value={note}
              disabled={!canManage}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== initialNote && save({ note }, () => setNote(initialNote))}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
            />
          </label>
        </div>
      )}
    </li>
  );
}
