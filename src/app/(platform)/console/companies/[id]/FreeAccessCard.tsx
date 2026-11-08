"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setFreeAccessAction } from "./free-access-actions";

/**
 * Lifetime free access for this company: never billed, every product, no limits, and none of the trial / plan banners. Taking it away is
 * the platform admin's call at any time; the company then has to subscribe (or, if chosen, gets a fresh trial first).
 */
export default function FreeAccessCard({ companyId, companyName, free, canManage }: { companyId: string; companyName: string; free: boolean; canManage: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(free);
  const [asking, setAsking] = useState(false);
  const [after, setAfter] = useState<"subscribe" | "trial">("subscribe");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function apply(next: boolean) {
    setNote(null);
    start(async () => {
      const res = await setFreeAccessAction(companyId, next, after);
      if (res.ok) {
        setOn(next);
        setAsking(false);
        setNote({ ok: true, text: res.message ?? (next ? "Free access is on." : "Free access removed.") });
        router.refresh();
      } else setNote({ ok: false, text: res.error });
    });
  }

  return (
    <GlassCard interactive={false} containerClassName="h-auto">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Gift className="size-5" /></span>
            <div>
              <CardTitle className="text-base">Lifetime free access</CardTitle>
              <CardDescription>
                {on ? `${companyName} is never billed: every product, no limits, and no trial or plan banners.` : `Give ${companyName} free access for life. No trial strip, no plan to buy. You can take it away whenever you like.`}
              </CardDescription>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Lifetime free access"
            disabled={!canManage || pending}
            onClick={() => (on ? setAsking(true) : apply(true))}
            className={cn("mt-switch", on && "mt-switch-on")}
          >
            <span className="mt-switch-label">{pending ? "…" : on ? "FREE" : "OFF"}</span>
            <span className="mt-switch-knob" aria-hidden />
          </button>
        </div>
      </CardHeader>
      {(asking || note || !canManage) && (
        <CardContent className="space-y-3">
          {!canManage && <p className="text-xs text-muted-foreground">You need the “manage subscriptions” permission to change this.</p>}
          {asking && (
            <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-semibold">Take away {companyName}’s free access?</p>
              <div role="radiogroup" className="space-y-2">
                {[
                  { v: "subscribe" as const, t: "They must subscribe now", d: "The workspace becomes read-only until they choose and pay for a plan." },
                  { v: "trial" as const, t: "Give them a fresh trial first", d: "A normal trial of their plan starts today; after it they must subscribe." },
                ].map((o) => (
                  <label key={o.v} className={cn("block cursor-pointer rounded-lg border p-3 text-sm", after === o.v ? "border-primary bg-primary/5" : "border-border")}>
                    <input type="radio" name="after" className="sr-only" checked={after === o.v} onChange={() => setAfter(o.v)} />
                    <span className="block font-semibold">{o.t}</span>
                    <span className="block text-xs text-muted-foreground">{o.d}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => apply(false)}>{pending ? "Working…" : "Remove free access"}</Button>
                <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setAsking(false)}>Keep it</Button>
              </div>
            </div>
          )}
          {note && <p className={cn("text-sm", note.ok ? "text-muted-foreground" : "text-destructive")}>{note.text}</p>}
        </CardContent>
      )}
    </GlassCard>
  );
}
