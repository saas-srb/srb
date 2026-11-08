"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markAnswerAction } from "@/app/(products)/evaliq/(protected)/actions";

/** Evaluator control for one answer: marks (0…max, or down to −negative) + comment. */
export default function MarkItemForm({ attemptId, index, max, min, current, comment, pending: isPending, override }: { attemptId: string; index: number; max: number; min: number; current: number | null; comment: string; pending: boolean; override: boolean }) {
  const router = useRouter();
  const [marks, setMarks] = useState(current === null ? "" : String(current));
  const [note, setNote] = useState(comment);
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(isPending);
  if (!open)
    return override ? (
      <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(true)}>
        Override marks
      </Button>
    ) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2">
      <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">{isPending ? "Pending manual evaluation" : "Override"}</span>
      <Input type="number" step={0.25} min={min} max={max} value={marks} onChange={(e) => setMarks(e.target.value)} className="h-8 w-24" aria-label={`Marks for question ${index + 1}`} />
      <span className="text-xs text-muted-foreground">{`/ ${max}`}</span>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment for the candidate (optional)" className="h-8 min-w-48 flex-1" aria-label="Comment" />
      <Button
        type="button"
        size="sm"
        disabled={busy || marks === ""}
        onClick={() =>
          start(async () => {
            const res = await markAnswerAction(attemptId, index, Number(marks), note);
            if (!res.ok) toast.error(res.error);
            else {
              toast.success("Marks saved");
              router.refresh();
            }
          })
        }
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
      </Button>
    </div>
  );
}
