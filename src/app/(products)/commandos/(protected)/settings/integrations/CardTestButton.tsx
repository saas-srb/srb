"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { testConnectionAction } from "./actions";
import { cn } from "@/lib/utils";

/** "Test" on a card: runs the real, safe check for that service and shows the plain result under the card's buttons. */
export default function CardTestButton({ provider, name }: { provider: string; name: string }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" disabled={pending} aria-label={`Test ${name}`} onClick={() => start(async () => setResult(await testConnectionAction(provider).catch(() => ({ ok: false, message: "The check could not run." }))))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60">
        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}Test
      </button>
      {result && <p role="status" className={cn("basis-full rounded-lg px-3 py-2 text-xs", result.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>{result.ok ? "Works: " : "Problem: "}{result.message}</p>}
    </>
  );
}
