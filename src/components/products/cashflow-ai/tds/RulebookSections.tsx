"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { setSectionUseAction } from "@/app/(products)/cashflow-ai/(protected)/tds/settings/actions";

export interface RulebookCard {
  code: string;
  label: string;
  covers: string;
  rate: number;
  noPanRate: number | null;
  singleThreshold: number | null;
  annualThreshold: number | null;
  active: boolean;
  /** The company has set its own figures for this section (Advanced). */
  ownFigures: boolean;
}

const inr = new Intl.NumberFormat("en-IN");
const d = (s: string) => s.split("-").reverse().join("-");

/** In words, for someone who has not met these limits before. */
function limits(c: RulebookCard): string {
  const parts: string[] = [];
  if (c.singleThreshold !== null) parts.push(`tax is deducted when one payment is above ₹${inr.format(c.singleThreshold)}`);
  if (c.annualThreshold !== null) parts.push(`tax is deducted once the year's total to one vendor is above ₹${inr.format(c.annualThreshold)}`);
  return parts.length ? parts.join("; ").replace(/^./, (x) => x.toUpperCase()) + "." : "No limit: tax is deducted on every payment.";
}

export default function RulebookSections({ fy, cards, canChange, confirmed, confirmedAt, confirmedBy }: { fy: string; cards: RulebookCard[]; canChange: boolean; confirmed: boolean; confirmedAt: string | null; confirmedBy: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function toggle(c: RulebookCard) {
    setBusy(c.code);
    startTransition(async () => {
      const res = await setSectionUseAction(c.code, !c.active);
      setBusy(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(c.active ? `${c.code} switched off` : `${c.code} switched on`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {confirmed ? (
        <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
          Rates and limits come from the law as published on the platform (checked{confirmedAt ? ` on ${d(confirmedAt)}` : ""}{confirmedBy ? ` by ${confirmedBy}` : ""}) for financial year {fy}. You do not need to enter anything.
        </p>
      ) : (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          These figures have not been checked by the platform yet; checks are indicative. You still do not need to enter anything.
        </p>
      )}
      {!canChange && <p className="text-xs text-muted-foreground">You can view these settings; changing them needs the compliance permission.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <GlassCard key={c.code} interactive={false}>
            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{c.code}: {c.label}</div>
                  {c.ownFigures && <Badge variant="outline" className="mt-1">Your own figures are in use</Badge>}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={c.active}
                  aria-label={`We pay under section ${c.code}`}
                  disabled={!canChange || pending}
                  onClick={() => toggle(c)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${c.active ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <span className={`inline-block size-5 rounded-full bg-background shadow transition-transform ${c.active ? "translate-x-5" : "translate-x-0.5"} ${busy === c.code ? "animate-pulse" : ""}`} />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">{c.covers}</p>
              <p className="text-sm"><span className="font-medium tabular-nums">{c.rate}%</span> is deducted{c.noPanRate !== null && <>, or <span className="tabular-nums">{c.noPanRate}%</span> if the vendor has no valid PAN</>}.</p>
              <p className="text-xs text-muted-foreground">{limits(c)}</p>
              <p className="text-xs">{c.active ? "We pay under this section" : <span className="text-muted-foreground">Not used by your company: hidden on bills and not checked</span>}</p>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
