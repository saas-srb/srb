"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROFILE_QUESTIONS, type ComplianceProfile } from "@/lib/products/cashflow-ai/compliance/filings-core";
import { startWorkPlanAction } from "@/app/(products)/cashflow-ai/(protected)/work/actions";

/** Asks the questions the company has not answered yet, then switches "My work" on. */
export default function StartPlanForm({ profile, canStart }: { profile: ComplianceProfile; canStart: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Partial<ComplianceProfile>>({});
  const unanswered = PROFILE_QUESTIONS.filter((q) => profile[q.key] === null);

  function start() {
    startTransition(async () => {
      const res = await startWorkPlanAction(answers);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Your work plan has started.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {unanswered.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Four quick questions, so we only show work that applies to you. Skip any you are not sure of; you can answer later.</p>
          {unanswered.map((q) => (
            <fieldset key={q.key} className="rounded-xl border border-border/50 p-3">
              <legend className="px-1 text-sm font-medium">{q.question}</legend>
              <p className="mb-2 text-xs text-muted-foreground">{q.help}</p>
              <div className="flex gap-2">
                {([true, false] as const).map((v) => {
                  const on = answers[q.key] === v;
                  return (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={on}
                      disabled={pending}
                      onClick={() => setAnswers((a) => ({ ...a, [q.key]: on ? undefined : v }))}
                      className={cn("h-9 min-w-20 rounded-lg border px-4 text-sm font-medium", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}
                    >
                      {v ? "Yes" : "No"}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <Button type="button" size="lg" className="h-11 px-6 text-base" disabled={pending || !canStart} onClick={start}>
        {pending && <Loader2 className="size-4 animate-spin" />} Start my work plan
      </Button>
      {!canStart && <p className="text-xs text-muted-foreground">Ask the owner or accountant to start the plan; your role can only view it.</p>}
    </div>
  );
}
