"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCompanyPromptsEnabledAction } from "./actions";

/** Platform-wide: may companies change the wording of the prompts that allow it? Off, every company uses the standard text (what they saved is kept and applies again when this is switched on). */
export default function CompanyPromptsSwitch({ enabled, canEdit, count }: { enabled: boolean; canEdit: boolean; count: number }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const change = (v: boolean) => {
    if (!v && !confirm("Turn off company prompts? Every company goes back to the standard wording until you turn this on again. What they saved is kept.")) return;
    setOn(v);
    setError(null);
    start(async () => {
      const res = await setCompanyPromptsEnabledAction(v).catch(() => ({ ok: false as const, error: "Could not save." }));
      if (res.ok) router.refresh();
      else {
        setOn(!v);
        setError(res.error);
      }
    });
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Companies can change some prompts for their own workspace</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Shown to companies as Settings → AI prompts. Only prompts marked below can be changed, only for that company, and always inside fixed security rules nobody can edit. {count} {count === 1 ? "company uses" : "companies use"} their own wording right now.</p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label="Companies can change prompts" disabled={!canEdit} onClick={() => change(!on)} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
