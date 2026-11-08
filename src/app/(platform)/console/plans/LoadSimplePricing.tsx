"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applySimplePricingAction } from "./actions";

/** One click: Free (1 person) · ₹499 (10) · ₹999 (50) · ₹1,999 (200) · Contact support (500), each with its service limits. Safe to repeat. */
export default function LoadSimplePricing() {
  const router = useRouter();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!ask ? (
        <Button type="button" variant="outline" onClick={() => setAsk(true)}>
          <Wand2 className="size-4" data-icon="inline-start" /> Load simple pricing
        </Button>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          Sets Free, Starter, Growth, Business and Enterprise with their prices and limits. Existing subscribers keep the price they bought.
          <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => { const r = await applySimplePricingAction(); setNote({ ok: r.ok, text: r.ok ? r.message : r.error }); setAsk(false); if (r.ok) router.refresh(); })}>{pending ? "Loading…" : "Load it"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAsk(false)}>Cancel</Button>
        </span>
      )}
      {note && <span className={note.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"} role="status">{note.text}</span>}
    </div>
  );
}
