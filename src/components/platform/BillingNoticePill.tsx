"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Lock, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStripDismiss, StripDismissButton } from "@/lib/platform/use-strip-dismiss";

export const BILLING_SETTINGS_PATH = "/commandos/settings/billing";

export interface BillingNoticeData {
  status: "trialing" | "past_due" | "grace" | "suspended" | "canceled" | "deleting";
  planName: string | null;
  daysLeft: number | null;
  firstChargeAt?: Date | null;
}

const days = (n: number | null) => (n === null ? "" : n <= 0 ? "ends today" : `${n} day${n === 1 ? "" : "s"} left`);

function copy(n: BillingNoticeData): { title: string; body: string; cta: string; tone: "info" | "warn" | "danger" } {
  const plan = n.planName ? `${n.planName} plan` : "plan";
  switch (n.status) {
    case "trialing":
      if (n.firstChargeAt) return { title: `${n.planName ?? "Plan"} subscribed · first charge ${n.firstChargeAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, body: `Autopay is set up for the ${plan}. Your first payment is when the free trial ends; nothing is charged before then.`, cta: "View billing", tone: "info" };
      return { title: `Free trial${n.daysLeft !== null ? ` · ${days(n.daysLeft)}` : ""}`, body: `You're trying the ${plan}. Choose a plan to keep your workspace running after the trial.`, cta: "Choose a plan", tone: n.daysLeft !== null && n.daysLeft <= 3 ? "warn" : "info" };
    case "past_due":
      return { title: "Payment overdue", body: "Your last payment didn't go through. We'll retry automatically — update your payment method to avoid interruption.", cta: "Update payment", tone: "warn" };
    case "grace":
      return { title: `Grace period${n.daysLeft !== null ? ` · ${days(n.daysLeft)}` : ""}`, body: "Payment is still outstanding. Your workspace becomes read-only when the grace period ends.", cta: "Pay now", tone: "danger" };
    case "suspended":
      return { title: "Workspace is read-only", body: "Your subscription is suspended. You can view everything, but nothing new can be created until you renew.", cta: "Renew subscription", tone: "danger" };
    case "deleting":
      return { title: `Scheduled for deletion${n.daysLeft !== null ? ` · ${days(n.daysLeft)}` : ""}`, body: "Your company and all its data will be deleted for good when the days run out. It is read-only until then. You can cancel the deletion and restore your account any time before.", cta: "Cancel deletion", tone: "danger" };
    case "canceled":
      return { title: "Subscription ended", body: "Your workspace is read-only. Choose a plan to start making changes again.", cta: "Choose a plan", tone: "danger" };
  }
}

const TONES = {
  info: "border-primary/25 bg-primary/10 dark:border-border dark:bg-card text-foreground [&_svg.notice-icon]:text-primary",
  warn: "border-amber-500/30 bg-amber-500/10 dark:border-border dark:bg-card text-foreground [&_svg.notice-icon]:text-amber-600 dark:[&_svg.notice-icon]:text-amber-400",
  danger: "border-rose-500/30 bg-rose-500/10 dark:border-border dark:bg-card text-foreground [&_svg.notice-icon]:text-rose-600 dark:[&_svg.notice-icon]:text-rose-400",
};

export default function BillingNoticePill({ notice, className }: { notice: BillingNoticeData; className?: string }) {
  const { isDismissed, dismiss } = useStripDismiss("billing-notice", "Billing notice");

  if (isDismissed) return null;

  const c = copy(notice);
  const Icon = notice.status === "trialing" ? Timer : notice.status === "suspended" || notice.status === "canceled" || notice.status === "deleting" ? Lock : AlertTriangle;
  const href = notice.status === "deleting" ? "/commandos/settings/backups" : BILLING_SETTINGS_PATH;

  return (
    <div id="billing-notice" role="status" data-status={notice.status} title={c.body} className={cn("inline-flex max-w-full shrink-0 items-center gap-2 self-start rounded-full border py-1 pl-3 pr-1.5 text-xs backdrop-blur-md", TONES[c.tone], className)}>
      <Icon className="notice-icon size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate font-semibold">{c.title}</span>
      <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background/70 dark:bg-background dark:hover:bg-muted px-2.5 py-1 font-semibold text-primary transition-colors hover:bg-background">
        {c.cta}
        <ArrowRight className="size-3" />
      </Link>
      <StripDismissButton onDismiss={dismiss} label="Billing notice" />
    </div>
  );
}
