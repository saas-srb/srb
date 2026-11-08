"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { setChecklistItemAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import { cn } from "@/lib/utils";

/** An interactive checklist inside a published SOP. Ticks are saved per person (on their assignment). */
export default function ChecklistBlock({
  sopId,
  blockId,
  title,
  items,
  initial,
  interactive,
}: {
  sopId: string;
  blockId: string;
  title: string;
  items: { id: string; text: string }[];
  initial: Record<string, boolean>;
  /** False for previews, drafts and people who can't acknowledge. */
  interactive: boolean;
}) {
  const [state, setState] = useState<Record<string, boolean>>(initial);
  const [, startTransition] = useTransition();
  const visible = items.filter((i) => i.text.trim());
  const done = visible.filter((i) => state[`${blockId}:${i.id}`]).length;
  if (visible.length === 0) return null;

  function toggle(itemId: string, next: boolean) {
    const key = `${blockId}:${itemId}`;
    setState((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      const res = await setChecklistItemAction(sopId, key, next);
      if (!res.ok) {
        setState((s) => ({ ...s, [key]: !next }));
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <ListChecks className="size-4 text-primary" />
          {title || "Checklist"}
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done}/{visible.length} done
        </span>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done / visible.length) * 100}%` }} />
      </div>
      <ul className="space-y-1">
        {visible.map((i) => {
          const checked = !!state[`${blockId}:${i.id}`];
          return (
            <li key={i.id}>
              <label className={cn("flex items-start gap-2 rounded-md px-1.5 py-1 text-sm", interactive ? "cursor-pointer hover:bg-muted/60" : "cursor-default")}>
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                  checked={checked}
                  disabled={!interactive}
                  onChange={(e) => toggle(i.id, e.target.checked)}
                />
                <span className={cn(checked && "text-muted-foreground line-through")}>{i.text}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {!interactive && <p className="mt-2 text-[11px] text-muted-foreground">Checklist progress is tracked once this SOP is published and you open it.</p>}
    </div>
  );
}
