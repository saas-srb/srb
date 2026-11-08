"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, PhoneOff, Radio } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import TestBadge from "@/components/products/agentos/calls/TestBadge";
import { endDealflowCallAction } from "@/app/(products)/dealflow-ai/(protected)/voice-calls/actions";
import { formatTimer, type PanelActiveCall } from "@/lib/dealflow-ai/call-panel-types";

function Timer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-mono text-xs tabular-nums" aria-label="Call time so far">{formatTimer((now - new Date(since).getTime()) / 1000)}</span>;
}

/** Calls ringing or in progress about DealFlow records: person, agent, timer, status, Open live view and End call (with a confirm). */
export default function ActiveCallsBar({ calls, onChanged, onSelect }: { calls: PanelActiveCall[]; onChanged: () => void; onSelect: (c: PanelActiveCall) => void }) {
  const [confirming, setConfirming] = useState<PanelActiveCall | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function end(c: PanelActiveCall) {
    setBusy(c.id);
    try {
      const r = await endDealflowCallAction(c.id);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.via === "cancelled" ? "Call cancelled" : "Call ended");
    } catch {
      toast.error("Couldn't end the call. Try again.");
    } finally {
      setBusy(null);
      setConfirming(null);
      onChanged();
    }
  }

  if (calls.length === 0) return null;
  return (
    <section aria-label="Active calls" className="space-y-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-red-500" /></span>
        Active calls
        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] tabular-nums">{calls.length}</span>
      </p>
      <ul className="divide-y divide-border/40">
        {calls.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
            <button type="button" onClick={() => onSelect(c)} className="font-semibold text-foreground hover:underline">{c.personName}</button>
            <CallStatusBadge status={c.status} />
            {c.testMode && <TestBadge />}
            <span className="text-xs text-muted-foreground">{c.agentName} · {c.purposeLabel}</span>
            <Timer since={c.startedAt} />
            <span className="ml-auto flex items-center gap-2">
              {c.canLive && <Link href={`/agentos/calls/${c.id}/live`} target="_blank" className={buttonVariants({ size: "sm", variant: "outline" })}><Radio className="size-3.5" />Open live view</Link>}
              {c.canEnd ? (
                <Button type="button" size="sm" variant="destructive" disabled={busy === c.id} onClick={() => setConfirming(c)}>
                  {busy === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <PhoneOff className="size-3.5" />}End call
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">Only the person who placed this call or a call manager can end it.</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <AlertDialog open={confirming !== null} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this call?</AlertDialogTitle>
            <AlertDialogDescription>The call with {confirming?.personName} will be hung up now. The AI agent stops talking and the call is saved with what was said so far.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the call</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => confirming && void end(confirming)}>End call</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
