"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { extendTrialAction } from "./actions";

export interface TrialCardData {
  planName: string | null;
  planId: string;
  status: string;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  daysLeft: number | null;
  canExtend: boolean;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const STATUS: Record<string, string> = { trialing: "On trial", grace: "Grace period", suspended: "Read-only", active: "Paying", past_due: "Payment failed", canceled: "Canceled" };

/** Subscription / trial summary with "extend trial" (audited server-side). */
export default function TrialCard({ companyId, data }: { companyId: string; data: TrialCardData }) {
  const router = useRouter();
  const [days, setDays] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Subscription &amp; trial</CardTitle>
        <CardDescription>
          {data.planName ?? data.planId} · <Badge variant="outline">{STATUS[data.status] ?? data.status}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Trial ends</dt>
            <dd className="mt-0.5">
              {fmt(data.trialEndsAt)}
              {data.daysLeft !== null && <span className="text-muted-foreground"> ({data.daysLeft} days left)</span>}
            </dd>
          </div>
          {data.graceEndsAt && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Grace ends</dt>
              <dd className="mt-0.5">{fmt(data.graceEndsAt)}</dd>
            </div>
          )}
        </dl>
        {data.canExtend ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const res = await extendTrialAction(companyId, Number(days));
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                toast.success(`Trial extended to ${fmt(res.trialEndsAt)}.`);
                router.refresh();
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="trial-extend-days">Extend trial by (days)</Label>
              <Input id="trial-extend-days" className="w-28" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <Button type="submit" id="trial-extend" disabled={pending}>
              {pending ? "Saving…" : "Extend trial"}
            </Button>
            {error && (
              <p role="alert" className="w-full text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">This company has paid, so there&apos;s no trial to extend.</p>
        )}
      </CardContent>
    </GlassCard>
  );
}
