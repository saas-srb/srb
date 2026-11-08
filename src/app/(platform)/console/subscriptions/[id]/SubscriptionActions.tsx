"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { SubscriptionStatus } from "@/lib/platform/billing/types";
import { subscriptionAdminAction, type SubscriptionAdminAction } from "./actions";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30";

export interface SubscriptionActionsProps {
  companyId: string;
  companyName: string;
  status: SubscriptionStatus;
  complimentary: boolean;
  planId: string;
  interval: "monthly" | "yearly";
  hasRazorpay: boolean;
  cancelAtPeriodEnd: boolean;
  plans: { id: string; name: string }[];
}

function Confirm({ label, title, description, destructive, disabled, onConfirm, id }: { label: string; title: string; description: string; destructive?: boolean; disabled?: boolean; onConfirm: () => Promise<boolean>; id?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button type="button" id={id} variant={destructive ? "destructive" : "outline"} disabled={disabled}>
            {label}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Back</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (await onConfirm()) setOpen(false);
              })
            }
          >
            {pending ? "Saving…" : label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function SubscriptionActions(p: SubscriptionActionsProps) {
  const router = useRouter();
  const [planId, setPlanId] = useState(p.planId);
  const [interval, setInterval] = useState<string>(p.interval);
  const [when, setWhen] = useState("auto");
  const [trialDays, setTrialDays] = useState("7");
  const [periodDays, setPeriodDays] = useState("");
  const [pending, start] = useTransition();

  async function run(action: SubscriptionAdminAction): Promise<boolean> {
    const res = await subscriptionAdminAction(p.companyId, action);
    if (res.ok) {
      toast.success(res.message ?? "Saved.");
      router.refresh();
      return true;
    }
    toast.error(res.error);
    return false;
  }

  const internal = p.status === "internal";
  const canExtendTrial = ["trialing", "suspended", "canceled"].includes(p.status);
  const canReactivate = p.status === "canceled" || p.status === "suspended";
  const canCancel = !internal && p.status !== "canceled";

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">Manage subscription</CardTitle>
        <CardDescription>Every action here is recorded in the audit log and the company&apos;s subscription history.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!internal && (
          <form
            className="space-y-3"
            aria-label="Change plan"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => void (await run({ kind: "change_plan", planId, interval, when })));
            }}
          >
            <h3 className="text-sm font-semibold">Change plan</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-plan">Plan</Label>
                <select id="admin-plan" className={selectClass} value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  {p.plans.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-interval">Billing cycle</Label>
                <select id="admin-interval" className={selectClass} value={interval} onChange={(e) => setInterval(e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              {p.hasRazorpay && (
                <div className="space-y-1.5">
                  <Label htmlFor="admin-when">When</Label>
                  <select id="admin-when" className={selectClass} value={when} onChange={(e) => setWhen(e.target.value)}>
                    <option value="auto">Upgrade now, downgrade at period end</option>
                    <option value="now">Immediately</option>
                    <option value="cycle_end">At period end</option>
                  </select>
                </div>
              )}
            </div>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} Change plan
            </Button>
          </form>
        )}

        {canExtendTrial && (
          <form
            className="space-y-3"
            aria-label="Extend trial"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => void (await run({ kind: "extend_trial", days: Number(trialDays) })));
            }}
          >
            <h3 className="text-sm font-semibold">Extend trial</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-trial-days">Days to add</Label>
                <Input id="admin-trial-days" type="number" min={1} max={365} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className="w-28" />
              </div>
              <Button type="submit" variant="outline" disabled={pending}>
                Extend trial
              </Button>
            </div>
          </form>
        )}

        {canReactivate && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Reactivate</h3>
            <p className="text-xs text-muted-foreground">
              Leave days empty to restore the running paid period or trial (or a fresh grace period). Enter days to grant a manually managed paid period, e.g. after an offline payment. A Razorpay subscription can&apos;t be revived — the company subscribes again from its billing page.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-period-days">Paid days (optional)</Label>
                <Input id="admin-period-days" type="number" min={1} max={730} value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} className="w-28" />
              </div>
              <Confirm
                id="admin-reactivate"
                label="Reactivate"
                title={`Reactivate ${p.companyName}?`}
                description="Full access comes back immediately."
                onConfirm={() => run({ kind: "reactivate", days: periodDays.trim() ? Number(periodDays) : null })}
              />
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Access & billing</h3>
          <div className="flex flex-wrap gap-2">
            {p.status === "suspended" ? (
              <Confirm id="admin-unsuspend" label="Unsuspend billing" title={`Unsuspend ${p.companyName}?`} description="Back to its running paid period or trial; otherwise a fresh grace period to pay." onConfirm={() => run({ kind: "unsuspend" })} />
            ) : (
              !internal && (
                <Confirm id="admin-suspend" destructive label="Suspend billing" title={`Suspend billing for ${p.companyName}?`} description="The workspace becomes read-only until you unsuspend it or the company pays. Razorpay isn't touched." onConfirm={() => run({ kind: "suspend" })} />
              )
            )}
            <Confirm
              id="admin-complimentary"
              label={internal ? "Remove complimentary" : "Mark complimentary"}
              title={internal ? `Stop complimentary access for ${p.companyName}?` : `Make ${p.companyName} complimentary?`}
              description={
                internal
                  ? "The company goes onto a fresh trial of its plan and must subscribe to keep access."
                  : "Never billed, every product, no limits. Any live Razorpay subscription is canceled now."
              }
              onConfirm={() => run({ kind: "complimentary", on: !internal })}
            />
            {canCancel && p.hasRazorpay && p.status === "active" && !p.cancelAtPeriodEnd && (
              <Confirm id="admin-cancel-period-end" label="Cancel at period end" title={`Cancel ${p.companyName} at period end?`} description="They keep access until the current period ends; Razorpay won't renew." onConfirm={() => run({ kind: "cancel", when: "period_end" })} />
            )}
            {canCancel && (
              <Confirm id="admin-cancel-now" destructive label="Cancel now" title={`Cancel ${p.companyName} now?`} description="The subscription ends immediately (no refund) and the workspace becomes read-only." onConfirm={() => run({ kind: "cancel", when: "now" })} />
            )}
          </div>
        </div>
      </CardContent>
    </GlassCard>
  );
}
