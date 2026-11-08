"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, PhoneOff, Radio } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import TestBadge from "@/components/products/agentos/calls/TestBadge";
import { endCallAction } from "@/lib/products/agentos/calls/actions";
import type { ActiveCallRow } from "@/lib/products/agentos/calls/end";
import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";
import { formatDateTime } from "@/lib/utils";

/** Calls ringing or in progress right now, each with End and Live buttons. */
export default function ActiveCallsStrip({ calls }: { calls: ActiveCallRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, run] = useTransition();
  if (!calls.length) return null;
  const end = (id: string) =>
    run(async () => {
      setBusy(id);
      const r = await endCallAction(id);
      setBusy(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Call ended");
      router.refresh();
    });
  return (
    <section aria-label="Active calls" className="space-y-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Radio className="size-4 text-emerald-600" />Active calls <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{calls.length}</span></p>
      <ul className="divide-y divide-border/40">
        {calls.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <CallStatusBadge status={c.status} />
            {c.testMode && <TestBadge />}
            <span className="font-medium">{c.targetLabel ?? "Call"}</span>
            <span className="text-xs text-muted-foreground">{c.agentName} · {PURPOSE_BY_KEY.get(c.purpose)?.label ?? c.purpose} · {formatDateTime(c.at)} · {c.mine ? "you" : c.startedBy}</span>
            <span className="ml-auto flex gap-2">
              {c.canLive && c.status === "in_progress" && <Link href={`/agentos/calls/${c.id}/live`} className={buttonVariants({ size: "sm", variant: "outline" })}><Radio className="size-3.5" />Live</Link>}
              {c.canEnd && (
                <Button type="button" size="sm" variant="destructive" disabled={busy === c.id} onClick={() => end(c.id)}>
                  {busy === c.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <PhoneOff className="size-3.5" />}End
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
