"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CalendarClock, Check, CheckCircle2, CreditCard, Crown, Gift, Loader2, Lock, Receipt, RotateCcw, Rocket, ShieldCheck, Sparkles, TicketPercent, XCircle, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SubscriptionStatusBadge from "@/components/platform/billing/SubscriptionStatusBadge";
import BillingDetailsForm, { type SaveBillingDetails } from "@/components/platform/billing/BillingDetailsForm";
import { openSubscriptionCheckout, type RazorpayHandlerResponse } from "@/components/platform/billing/razorpay-checkout";
import { formatMoney, type BillingInterval, type SubscriptionStatus } from "@/lib/platform/billing/types";
import type { BillingDetails, PlanOption, PriceSummary } from "@/lib/platform/billing/billing-details";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type CheckoutResult = { ok: true; checkout: { key: string; subscriptionId: string; name: string; description: string; amount: number; currency: string; prefill: { name: string; email: string }; startsAt: string | null } } | { ok: false; error: string };

export interface BillingView {
  configured: boolean;
  status: SubscriptionStatus;
  planId: string;
  planName: string;
  interval: BillingInterval;
  trialDaysLeft: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasLive: boolean;
  /** Charged per cycle (tax-inclusive), when known. */
  chargedPerCycle: { total: number; currency: string; couponCode: string | null } | null;
  pendingChange: { planId: string; planName: string; interval: BillingInterval; effectiveAt: string | null } | null;
  billingDetails: BillingDetails | null;
  /** The company can only move up: plans below its own are not selectable. */
  blockDowngrade?: boolean;
  /** A Razorpay subscription exists (autopay approved), even if its first charge is still to come. */
  autopay?: boolean;
  lastPayment?: { amount: number; currency: string; at: string } | null;
}

export interface BillingActions {
  quote: (planId: string, interval: BillingInterval, couponCode: string | null) => Promise<{ ok: true; summary: PriceSummary } | { ok: false; error: string }>;
  saveDetails: SaveBillingDetails;
  startCheckout: (planId: string, interval: BillingInterval, couponCode: string | null, startNow?: boolean) => Promise<CheckoutResult>;
  confirmCheckout: (response: RazorpayHandlerResponse) => Promise<Result>;
  /** `checkout` comes back when the change needs a new payment approval (UPI subscriptions can't be edited in place). */
  changePlan: (planId: string, interval: BillingInterval, couponCode: string | null) => Promise<Result | ({ ok: true; message?: string } & Partial<Extract<CheckoutResult, { ok: true }>>)>;
  cancel: () => Promise<Result>;
  resume: () => Promise<CheckoutResult>;
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

/** The page's steps as real tabs: one section on screen at a time, keyboard-operable (arrow keys, Home, End), and kept in the address (#billing-checkout). */
function BillingTabs({ items, active, onChange }: { items: readonly { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? (i + 1) % items.length : e.key === "ArrowLeft" ? (i - 1 + items.length) % items.length : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    onChange(items[to].id);
    document.getElementById(`${items[to].id}-tab`)?.focus();
  };
  return (
    <div id="billing-tabs" role="tablist" aria-label="Plan and billing" className="bl-nav">
      {items.map((x, i) => (
        <button key={x.id} type="button" role="tab" id={`${x.id}-tab`} aria-selected={active === x.id} aria-controls={x.id} tabIndex={active === x.id ? 0 : -1} onClick={() => onChange(x.id)} onKeyDown={(e) => onKey(e, i)} className={`bl-nav-link ${active === x.id ? "is-on" : ""}`}>
          <span className="bl-nav-n">{i + 1}</span>
          {x.label}
        </button>
      ))}
    </div>
  );
}

/** A numbered section heading: what this part of the page is for. */
function SectionHead({ step, icon: Icon, title, desc, aside }: { step: number; icon: React.ComponentType<{ className?: string }>; title: string; desc: string; aside?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <span className="bl-step"><Icon className="size-5" /><i>{step}</i></span>
        <div>
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      {aside}
    </header>
  );
}

const SELECTED_ICON: Record<string, LucideIcon> = { free: Gift, starter: Sparkles, growth: Rocket, business: Building2, enterprise: Crown };

export default function BillingManager({ view, plans, actions, plansSlot, usageSlot }: { view: BillingView; plans: PlanOption[]; actions: BillingActions; /** The plan cards (chosen plan comes back through the `billing:select-plan` event). */ plansSlot?: React.ReactNode; /** This month's usage meters. */ usageSlot?: React.ReactNode }) {
  const router = useRouter();
  const initialPlan = plans.some((p) => p.id === view.planId) ? view.planId : (plans[0]?.id ?? "");
  const [planId, setPlanId] = useState(initialPlan);
  const [interval, setInterval] = useState<BillingInterval>(view.interval);
  const [couponInput, setCouponInput] = useState(view.chargedPerCycle?.couponCode ?? "");
  const [coupon, setCoupon] = useState<string | null>(view.chargedPerCycle?.couponCode ?? null);
  const [summary, setSummary] = useState<PriceSummary | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [details, setDetails] = useState<BillingDetails | null>(view.billingDetails);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const stepList = [
    { id: "billing-overview", label: "Overview" },
    ...(view.status !== "internal" && plansSlot ? [{ id: "billing-plans-section", label: "Plans" }] : []),
    { id: "billing-details", label: "Billing details" },
    ...(view.status !== "internal" ? [{ id: "billing-checkout", label: "Checkout" }, { id: "billing-payment", label: "Payment" }] : []),
    ...(usageSlot ? [{ id: "billing-usage-section", label: "Usage" }] : []),
  ] as const;
  // True from choosing a plan until payment: the billing details step then offers "Continue to payment".
  const [flow, setFlow] = useState(false);
  // During a free trial: pay and start the plan today (true) or when the trial ends (false).
  const [startNow, setStartNow] = useState(true);
  // Where the Razorpay payment is: shown on the Payment step.
  // The Payment step's own area: Razorpay Checkout is shown in here.
  const payMount = useRef<HTMLDivElement>(null);
  const [pay, setPay] = useState<{ phase: "idle" | "starting" | "waiting" | "closed" | "confirming" | "done" | "error"; message?: string }>({ phase: "idle" });
  const [tab, setTab] = useState<string>(stepList[0].id);
  const ids = stepList.map((x) => x.id).join(",");
  const go = useCallback(
    (id: string) => {
      if (!ids.split(",").includes(id)) return;
      setTab(id);
      try {
        window.history.replaceState(null, "", `#${id}`);
      } catch {
        /* the address bar is a convenience */
      }
      requestAnimationFrame(() => document.getElementById("billing-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    [ids],
  );
  // Arriving on a link like /settings/billing#billing-checkout opens that step.
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h && ids.split(",").includes(h)) setTab(h);
    // The "Upgrade plan" strip links here with the plan to move to (?plan=growth): chosen, and on to the billing details.
    const want = new URLSearchParams(window.location.search).get("plan");
    if (want && plans.some((p) => p.id === want) && want !== view.planId) {
      setPlanId(want);
      setFlow(true);
      setTab("billing-details");
      try {
        window.history.replaceState(null, "", `${window.location.pathname}#billing-details`);
      } catch {
        /* cosmetic */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const show = (id: string): React.CSSProperties | undefined => (tab === id ? undefined : { display: "none" });
  const [confirming, setConfirming] = useState(false);
  const [quoting, startQuote] = useTransition();
  const [busy, startBusy] = useTransition();

  useEffect(() => {
    if (!planId) return;
    let alive = true;
    startQuote(async () => {
      const res = await actions.quote(planId, interval, coupon);
      if (!alive) return;
      if (res.ok) {
        setSummary(res.summary);
        setQuoteError(null);
      } else {
        setSummary(null);
        setQuoteError(res.error);
      }
    });
    return () => {
      alive = false;
    };
  }, [planId, interval, coupon, actions]);

  // The plan cards above ask for a plan to be selected here (they only compare; the checkout is this section).
  useEffect(() => {
    const onSelect = (e: Event) => {
      const d = (e as CustomEvent<{ planId: string; interval: BillingInterval }>).detail;
      if (d && plans.some((p) => p.id === d.planId)) {
        setPlanId(d.planId);
        setInterval(d.interval);
        // Choosing a plan always passes through the billing details (confirm or correct them) on the way to payment.
        setFlow(true);
        go("billing-details");
      }
    };
    window.addEventListener("billing:select-plan", onSelect);
    return () => window.removeEventListener("billing:select-plan", onSelect);
  }, [plans, go]);

  const samePlan = view.hasLive && planId === view.planId && interval === view.interval && (coupon ?? null) === (view.chargedPerCycle?.couponCode ?? null);
  const isInternal = view.status === "internal";

  async function runCheckout(res: CheckoutResult) {
    if (!res.ok) {
      setNotice({ tone: "error", text: res.error });
      setPay({ phase: "error", message: res.error });
      return;
    }
    const c = res.checkout;
    let failed: string | null = null;
    setPay({ phase: "waiting" });
    const response = await openSubscriptionCheckout({ key: c.key, subscriptionId: c.subscriptionId, name: c.name, description: c.description, prefill: c.prefill, onPaymentFailed: (m) => (failed = m), mount: payMount.current });
    if (!response) {
      const text = failed ?? "Checkout closed. Nothing was charged.";
      setNotice({ tone: "error", text });
      setPay({ phase: "closed", message: text });
      return;
    }
    setConfirming(true);
    setPay({ phase: "confirming" });
    const confirmed = await actions.confirmCheckout(response).catch((): Result => ({ ok: false, error: "Payment received, but we couldn't confirm it yet. It will update automatically." }));
    setConfirming(false);
    setNotice(confirmed.ok ? { tone: "ok", text: confirmed.message ?? "Done." } : { tone: "error", text: confirmed.error });
    setPay(confirmed.ok ? { phase: "done", message: confirmed.message ?? "Your subscription is active." } : { phase: "error", message: confirmed.error });
    router.refresh();
  }

  function subscribeOrChange() {
    setNotice(null);
    setPay({ phase: "starting" });
    startBusy(async () => {
      try {
        if (view.hasLive) {
          const res = await actions.changePlan(planId, interval, coupon);
          if (res.ok && "checkout" in res && res.checkout) {
            await runCheckout({ ok: true, checkout: res.checkout });
            return;
          }
          setNotice(res.ok ? { tone: "ok", text: res.message ?? "Plan updated." } : { tone: "error", text: res.error });
          setPay(res.ok ? { phase: "done", message: res.message ?? "Your plan is updated." } : { phase: "error", message: res.error });
          if (res.ok) router.refresh();
        } else {
          await runCheckout(await actions.startCheckout(planId, interval, coupon, startNow));
        }
      } catch (err) {
        const text = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setNotice({ tone: "error", text });
        setPay({ phase: "error", message: text });
      }
    });
  }

  const isFree = view.status === "active" && !view.hasLive;
  // A plan above the current one can be bought online (the top plan is "contact us" for anything bigger).
  const currentMonthly = plans.find((p) => p.id === view.planId)?.priceMonthly ?? 0;
  const canUpgrade = !isInternal && !!plansSlot && plans.some((p) => (p.priceMonthly ?? 0) > currentMonthly);
  const HeroIcon = isInternal ? Gift : isFree ? Sparkles : Crown;
  const selected = plans.find((p) => p.id === planId);
  const selPrice = selected ? (interval === "yearly" ? selected.priceYearly : selected.priceMonthly) : null;
  const trialPct = view.trialDaysLeft !== null ? Math.max(4, Math.min(100, Math.round((view.trialDaysLeft / 30) * 100))) : 0;
  const renewal = isInternal ? "No charges" : isFree ? "Free for life" : view.status === "trialing" ? `${view.trialDaysLeft ?? 0} day${view.trialDaysLeft === 1 ? "" : "s"} left` : fmtDate(view.currentPeriodEnd);

  const perCycle = view.chargedPerCycle ? formatMoney(view.chargedPerCycle.total, view.chargedPerCycle.currency) : null;
  const chargeDay = view.status === "trialing" ? fmtDate(view.trialEndsAt) : fmtDate(view.currentPeriodEnd);
  const every = view.interval === "yearly" ? "year" : "month";
  const statusLabel = isInternal ? "Complimentary" : isFree ? "Free for life" : ({ trialing: "Free trial", active: view.cancelAtPeriodEnd ? "Ending" : "Active", past_due: "Payment failed", grace: "Payment overdue", suspended: "Suspended", canceled: "Ended" } as Record<string, string>)[view.status] ?? view.status;
  const nextCharge = isInternal || isFree ? "Nothing to pay" : view.cancelAtPeriodEnd ? "None: it ends on " + fmtDate(view.currentPeriodEnd) : view.status === "trialing" ? (view.autopay ? `${perCycle ?? "—"} on ${chargeDay}` : "Nothing scheduled") : view.status === "active" ? `${perCycle ?? "—"} on ${chargeDay}` : "—";
  const story: { title: string; text: string } = isInternal
    ? { title: "Your workspace is complimentary", text: "There is nothing to pay, and every product is included." }
    : isFree
      ? { title: `You are on the ${view.planName} plan, free for life`, text: "Nothing is ever charged. Upgrade any time for more people and bigger allowances; you can try a paid plan free for a month." }
      : view.status === "trialing"
        ? view.autopay
          ? { title: `Your free trial of ${view.planName} is running, and autopay is set up`, text: `Nothing is charged before ${chargeDay}. On that day ${perCycle ?? "the plan price"} (incl. GST) is charged, then every ${every}. You can also pay earlier, or cancel before then and pay nothing.` }
          : { title: `You are trying ${view.planName} free`, text: `Your trial ends on ${chargeDay}. Nothing is charged, and nothing is set up yet. Subscribe before then to keep your workspace running without a break.` }
        : view.cancelAtPeriodEnd
          ? { title: `Your subscription ends on ${chargeDay}`, text: "You keep full access until then. Resume it any time before that day and nothing changes." }
          : view.status === "active"
            ? { title: `Your ${view.planName} subscription is active`, text: `It renews on ${chargeDay}${perCycle ? ` for ${perCycle} (incl. GST)` : ""}, every ${every}${view.lastPayment ? `. Last payment ${formatMoney(view.lastPayment.amount, view.lastPayment.currency)} on ${fmtDate(view.lastPayment.at)}` : ""}.` }
            : { title: "Your subscription needs attention", text: "See the notice below for what to do." };
  type Step = { label: string; sub?: string; state: "done" | "now" | "next" };
  const timeline: Step[] =
    view.status === "trialing" && view.trialEndsAt
      ? [
          { label: "Trial started", state: "done" },
          { label: "Today", sub: `${view.trialDaysLeft ?? 0} day${view.trialDaysLeft === 1 ? "" : "s"} of trial left`, state: "now" },
          { label: `Trial ends ${fmtDate(view.trialEndsAt)}`, sub: view.autopay ? "Autopay takes over" : "Subscribe before this day", state: "next" },
          { label: view.autopay ? `First charge ${perCycle ?? ""}` : "Then pay as you go", sub: `Every ${every}, cancel any time`, state: "next" },
        ]
      : view.status === "active" && !isFree && !view.cancelAtPeriodEnd
        ? [
            ...(view.lastPayment ? [{ label: "Last payment", sub: `${formatMoney(view.lastPayment.amount, view.lastPayment.currency)} on ${fmtDate(view.lastPayment.at)}`, state: "done" as const }] : []),
            { label: "Today", sub: "Subscription active", state: "now" as const },
            { label: `Renews ${chargeDay}`, sub: perCycle ? `${perCycle} incl. GST` : undefined, state: "next" as const },
          ]
        : [];

  return (
    <div className="space-y-7">
      <BillingTabs items={stepList} active={tab} onChange={go} />

      {notice && tab !== "billing-payment" && (
        <p role="status" className={notice.tone === "error" ? "bl-alert bl-alert-bad" : "bl-alert bl-alert-good"}>
          {notice.text}
        </p>
      )}

      {/* Where you are now */}
      <section id="billing-overview" role="tabpanel" aria-labelledby="billing-overview-tab" style={show("billing-overview")} className="bl-hero scroll-mt-24">
        <div className="bl-aurora" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="bl-hero-icon"><HeroIcon className="size-7" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Your plan</p>
              <h2 id="billing-current" className="text-3xl font-black tracking-tight">{view.planName}</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SubscriptionStatusBadge status={view.status} cancelAtPeriodEnd={view.cancelAtPeriodEnd} complimentary={isInternal} />
            {view.status === "trialing" && !view.hasLive && !isInternal && (
              <Button
                type="button"
                variant="outline"
                id="billing-subscribe-now"
                onClick={() => {
                  setPlanId(view.planId);
                  setFlow(true);
                  go("billing-details");
                }}
              >
                <CreditCard className="size-4" /> Subscribe to {view.planName}
              </Button>
            )}
            {canUpgrade && (
              <Button type="button" id="billing-upgrade" onClick={() => go("billing-plans-section")}>
                <Sparkles className="size-4" /> Upgrade plan
              </Button>
            )}
          </div>
        </div>
        {/* In plain words: where the subscription stands and what happens next. */}
        <div className="relative mt-6 rounded-2xl border border-border bg-background/50 p-4 sm:p-5" id="billing-story">
          <p className="text-base font-black leading-snug">{story.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{story.text}</p>
          {timeline.length > 0 && (
            <ol className="mt-4 grid gap-3 sm:grid-cols-4" aria-label="What happens next">
              {timeline.map((t) => (
                <li key={t.label} className="flex items-start gap-2.5">
                  <span className={`mt-1 size-2.5 shrink-0 rounded-full ${t.state === "done" ? "bg-emerald-500" : t.state === "now" ? "bg-primary ring-4 ring-primary/25" : "bg-muted-foreground/40"}`} aria-hidden />
                  <span className="min-w-0">
                    <span className={`block text-sm leading-tight ${t.state === "next" ? "font-semibold text-muted-foreground" : "font-bold"}`}>{t.label}</span>
                    {t.sub && <span className="block text-xs text-muted-foreground">{t.sub}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <dl className="relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Crown, label: "Plan", value: isInternal ? "Complimentary" : view.planName },
            { icon: CalendarClock, label: "Billing cycle", value: isFree || isInternal ? "—" : view.interval === "yearly" ? "Yearly" : "Monthly" },
            { icon: ShieldCheck, label: "Status", value: statusLabel },
            { icon: Zap, label: view.status === "trialing" ? "Trial ends" : view.cancelAtPeriodEnd ? "Ends on" : "Next renewal", value: view.status === "trialing" ? `${fmtDate(view.trialEndsAt)} (${view.trialDaysLeft ?? 0} day${view.trialDaysLeft === 1 ? "" : "s"} left)` : renewal },
            { icon: Receipt, label: "Next charge", value: nextCharge },
            { icon: CreditCard, label: "Autopay", value: isFree || isInternal ? "—" : view.autopay ? "On, through Razorpay" : "Off" },
            { icon: Receipt, label: "Last payment", value: view.lastPayment ? `${formatMoney(view.lastPayment.amount, view.lastPayment.currency)} on ${fmtDate(view.lastPayment.at)}` : isFree || isInternal ? "—" : "No payment yet" },
            { icon: Lock, label: "Access", value: view.status === "suspended" || view.status === "canceled" ? "Read-only" : "Full" },
          ].map((t) => (
            <div key={t.label} className="bl-tile">
              <t.icon className="size-4 text-primary" />
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.label}</dt>
                <dd className="truncate text-sm font-bold">{t.value}</dd>
              </div>
            </div>
          ))}
        </dl>
        {view.status === "trialing" && view.trialEndsAt && (
          <div className="relative mt-4 space-y-1.5">
            <div className="bl-track" aria-hidden><span style={{ width: `${trialPct}%` }} /></div>
            <p className="text-xs text-muted-foreground">Trial ends {fmtDate(view.trialEndsAt)}</p>
          </div>
        )}
        {view.pendingChange && (
          <p className="bl-alert bl-alert-info relative mt-4"><CalendarClock className="mt-0.5 size-4 shrink-0" />Moving to {view.pendingChange.planName} ({view.pendingChange.interval}) on {fmtDate(view.pendingChange.effectiveAt)}.</p>
        )}
        {(view.status === "past_due" || view.status === "grace") && (
          <p className="bl-alert bl-alert-warn relative mt-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {view.status === "past_due" ? "Your last payment failed. Razorpay is retrying automatically — make sure your payment method has funds." : `Payment is overdue. Your workspace stays fully usable until ${fmtDate(view.graceEndsAt)}; subscribe again below to keep access.`}
          </p>
        )}
        {(view.status === "suspended" || view.status === "canceled") && (
          <p className="bl-alert bl-alert-bad relative mt-4"><XCircle className="mt-0.5 size-4 shrink-0" />Your workspace is read-only. Choose a plan below to restore full access — your data is safe.</p>
        )}
        {(view.hasLive && !view.cancelAtPeriodEnd) || view.cancelAtPeriodEnd ? (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {view.hasLive && !view.cancelAtPeriodEnd && (
              <Button
                type="button"
                variant="outline"
                id="billing-cancel"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(view.status === "trialing" ? "Cancel your subscription? You won't be charged when the trial ends." : "Cancel at the end of this billing period? You keep full access until then.")) return;
                  setNotice(null);
                  startBusy(async () => {
                    const res = await actions.cancel();
                    setNotice(res.ok ? { tone: "ok", text: res.message ?? "Canceled." } : { tone: "error", text: res.error });
                    if (res.ok) router.refresh();
                  });
                }}
              >
                <XCircle className="size-4" /> Cancel at period end
              </Button>
            )}
            {view.cancelAtPeriodEnd && (
              <Button
                type="button"
                id="billing-resume"
                disabled={busy || !view.configured || !details}
                onClick={() => {
                  setNotice(null);
                  startBusy(async () => runCheckout(await actions.resume()));
                }}
              >
                <RotateCcw className="size-4" /> Resume subscription
              </Button>
            )}
          </div>
        ) : null}
      </section>

      {!isInternal && plansSlot && (
        <section id="billing-plans-section" role="tabpanel" aria-labelledby="billing-plans-section-tab" style={show("billing-plans-section")} className="bl-section">
          <SectionHead step={2} icon={Sparkles} title="Pick the plan that fits your team" desc="Every plan has every product and feature. A bigger plan means more people and more storage, AI, email and voice." />
          <span id="billing-plans" className="sr-only">Plans</span>
          {plansSlot}
        </section>
      )}

      <section id="billing-details" role="tabpanel" aria-labelledby="billing-details-tab" style={show("billing-details")} className="bl-section">
        <SectionHead step={3} icon={Receipt} title="Billing details" desc="Printed on your GST invoices. Add your GSTIN to claim input tax credit." />
        <span id="billing-details-heading" className="sr-only">Billing details</span>
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <aside className="bl-info">
            <ShieldCheck className="size-5 text-primary" />
            <p className="font-bold">Why we ask</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" /> Your legal name and address go on every GST invoice.</li>
              <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" /> A GSTIN lets you claim input tax credit.</li>
              <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" /> Invoices are emailed to the address you give.</li>
            </ul>
          </aside>
          <div className="bl-form"><BillingDetailsForm
              initial={details}
              save={actions.saveDetails}
              onSaved={(d) => {
                setDetails(d);
                if (flow) go("billing-checkout");
              }}
            />
            {flow && details && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                <p className="text-sm font-medium">These are the details that will go on your invoice. Correct them above, or continue.</p>
                <Button type="button" onClick={() => go("billing-checkout")}>
                  Continue to payment <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      {!isInternal && (
        <section id="billing-checkout" role="tabpanel" aria-labelledby="billing-checkout-tab" style={show("billing-checkout")} className="bl-section">
          <SectionHead
            step={4}
            icon={CreditCard}
            title="Checkout"
            desc={view.hasLive ? "Review your order. An upgrade starts at once: a new period begins and the unused part of your last payment is refunded pro rata." : "Review your order, then continue to a secure payment with Razorpay. You can cancel any time."}
            aside={
              <div className="pc-switch" role="group" aria-label="Billing cycle" data-yearly={interval === "yearly"}>
                <span className="pc-switch-pill" aria-hidden />
                {(["monthly", "yearly"] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={interval === c} onClick={() => setInterval(c)} className={`pc-switch-btn ${interval === c ? "is-on" : ""}`}>
                    {c === "monthly" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            }
          />
          <span id="billing-choose" className="sr-only">Checkout</span>
          <div className="grid items-stretch gap-6 lg:grid-cols-[1.15fr_1fr]">
            <div className="flex flex-col gap-5">
              {/* The plan was chosen in the Plans step; payment only shows it, and what changes, with a way back to change it. */}
              {selected && (() => {
                const current = plans.find((x) => x.id === view.planId);
                const isCurrent = selected.id === view.planId;
                const moving = !!current && !isCurrent;
                const up = moving && (selected.priceMonthly ?? 0) > (current?.priceMonthly ?? 0);
                const Icon = SELECTED_ICON[selected.id] ?? Zap;
                const perMonth = selPrice !== null ? (interval === "yearly" ? Math.round(selPrice / 12) : selPrice) : null;
                const before = new Map((current?.perks ?? []).map((k) => [k.label, k.value]));
                return (
                  <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card" data-plan={planId}>
                    <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/25"><Icon className="size-6" /></span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Your selected plan</p>
                          <p className="flex flex-wrap items-center gap-2 text-2xl font-black leading-tight">
                            {selected.name}
                            <span className="rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs font-bold">{interval === "yearly" ? "Billed yearly" : "Billed monthly"}</span>
                            {up && <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">Upgrade</span>}
                          </p>
                        </div>
                      </div>
                      {selPrice !== null && (
                        <div className="text-right">
                          <p className="text-3xl font-black leading-none tabular-nums">{formatMoney(selPrice, selected.currency)}<span className="text-sm font-semibold text-muted-foreground"> /{interval === "yearly" ? "year" : "month"}</span></p>
                          <p className="mt-1.5 text-xs text-muted-foreground">{interval === "yearly" && perMonth !== null ? `That's ${formatMoney(perMonth, selected.currency)} a month · excl. GST` : "excl. GST"}</p>
                        </div>
                      )}
                    </div>
                    {moving && (
                      <p className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-background/60 px-3.5 py-2 text-sm font-semibold ring-1 ring-border">
                        <span className="text-muted-foreground">{current!.name}</span>
                        <ArrowRight className="size-4 text-primary" />
                        <span>{selected.name}</span>
                        <span className="ml-auto text-xs font-medium text-muted-foreground">{view.hasLive ? "Starts today; the unused part of your last payment is refunded pro rata." : "Starts as soon as the payment goes through."}</span>
                      </p>
                    )}
                    {selected.perks && selected.perks.length > 0 && (
                      <ul className="grid flex-1 auto-rows-fr grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-3" aria-label={`What ${selected.name} includes`}>
                        {selected.perks.map((k) => {
                          const was = moving ? before.get(k.label) : undefined;
                          return (
                            <li key={k.label} className="bg-card px-4 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
                              <p className="mt-0.5 text-sm font-black tabular-nums">
                                {was && was !== k.value && <span className="mr-1.5 text-xs font-medium text-muted-foreground line-through">{was}</span>}
                                {k.value}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-5 py-3">
                      <p className="text-xs text-muted-foreground">Every product and feature is in every plan.</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => go("billing-plans-section")}>Change plan</Button>
                    </div>
                  </div>
                );
              })()}
              {/* Free trial: the paid plan can be taken at any time (this plan or a higher one), starting now or when the trial ends. */}
              {view.status === "trialing" && !view.hasLive && (
                <fieldset className="space-y-2">
                  <legend className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">When should it start?</legend>
                  {[
                    { now: true, title: "Start now", text: "Pay today. The trial ends and the paid plan starts at once." },
                    { now: false, title: view.trialEndsAt ? `When my free trial ends, ${fmtDate(view.trialEndsAt)}` : "When my free trial ends", text: "No charge today, and you keep every trial day. You only set up autopay now." },
                  ].map((o) => (
                    <label key={String(o.now)} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${startNow === o.now ? "border-primary/60 bg-primary/10" : "border-border bg-muted/20 hover:bg-muted/40"}`}>
                      <input type="radio" name="billing-start" checked={startNow === o.now} onChange={() => setStartNow(o.now)} className="mt-1 size-4 accent-[var(--primary)]" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{o.title}</span>
                        <span className="block text-xs text-muted-foreground">{o.text}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {!view.configured && <p className="bl-alert bl-alert-info">Online payments aren&apos;t available yet. Please contact support to subscribe.</p>}
              {!details && <p className="bl-alert bl-alert-info">You can upgrade any time. We&apos;ll ask for your billing details (they go on your GST invoices) when you press Subscribe.</p>}
            </div>

            <div className="bl-receipt flex flex-col !self-stretch">
              <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground"><Receipt className="size-4" /> Order summary</p>
              <div id="billing-price-summary" aria-live="polite" className="mb-4 space-y-2 text-sm">
                {quoteError ? (
                  <p className="text-destructive">{quoteError}</p>
                ) : !summary ? (
                  <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Pricing…</p>
                ) : (
                  <>
                    {summary.lines.map((l, i) => (
                      <div key={i} className="flex justify-between gap-3">
                        <span className="min-w-0">{l.label}</span>
                        <span className="tabular-nums">{l.amount < 0 ? `− ${formatMoney(-l.amount, summary.currency)}` : formatMoney(l.amount, summary.currency)}</span>
                      </div>
                    ))}
                    {summary.discount > 0 && !summary.lines.some((l) => l.kind === "discount") && (
                      <div className="flex justify-between gap-3"><span>Discount</span><span className="tabular-nums">− {formatMoney(summary.discount, summary.currency)}</span></div>
                    )}
                    <div className="flex justify-between gap-3 text-muted-foreground"><span>GST ({summary.gstRatePercent}%{summary.pricesIncludeTax ? ", included" : ""})</span><span className="tabular-nums">{formatMoney(summary.gst, summary.currency)}</span></div>
                    <div className="bl-total">
                      <span>Total per {summary.interval === "yearly" ? "year" : "month"}</span>
                      <span className="tabular-nums" id="billing-total">{formatMoney(summary.total, summary.currency)}</span>
                    </div>
                    {summary.couponError && <p id="billing-coupon-error" className="text-destructive">{summary.couponError}</p>}
                    {summary.couponApplied && <p className="font-semibold text-emerald-700 dark:text-emerald-400">Coupon {summary.couponCode} applied.</p>}
                    {quoting && <p className="text-xs text-muted-foreground">Updating…</p>}
                  </>
                )}
              </div>
              {view.status === "trialing" && !view.hasLive && (
                <p className="mb-3 rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{startNow ? "Charged today. Your free trial ends with the payment." : `Nothing is charged today. The first charge is ${view.trialEndsAt ? `on ${fmtDate(view.trialEndsAt)}, when your trial ends` : "when your trial ends"}.`}</p>
              )}
              {/* Coupon: part of the order, so it sits with the total it changes. */}
              <form
                className="mt-auto border-t border-dashed border-border pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  setCoupon(couponInput.trim().toUpperCase() || null);
                }}
              >
                <Label htmlFor="billing-coupon" className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Have a coupon?</Label>
                <div className="mt-2 flex gap-2">
                  <Input id="billing-coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} maxLength={64} autoCapitalize="characters" spellCheck={false} className="min-w-0 flex-1 font-mono uppercase" placeholder="Enter code" />
                  <Button type="submit" variant="outline" className="shrink-0"><TicketPercent className="size-4" /> Apply</Button>
                  {coupon && <Button type="button" variant="ghost" className="shrink-0" onClick={() => { setCoupon(null); setCouponInput(""); }}>Remove</Button>}
                </div>
              </form>
              <button
                type="button"
                id="billing-submit"
                className="pc-btn pc-btn-primary mt-5 w-full"
                disabled={busy || quoting || !summary || Boolean(quoteError) || !view.configured || samePlan || Boolean(coupon && summary?.couponError)}
                onClick={() => {
                  if (!details) return setDetailsOpen(true);
                  go("billing-payment");
                  subscribeOrChange();
                }}
              >
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CreditCard className="mr-2 size-4" />}
                Continue to payment
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><Lock className="size-3" /> Secure payment by Razorpay · cancel any time</p>
            </div>
          </div>
        </section>
      )}

      {!isInternal && (
        <section id="billing-payment" role="tabpanel" aria-labelledby="billing-payment-tab" style={show("billing-payment")} className="bl-section">
          <SectionHead step={5} icon={Lock} title="Payment" desc="Complete your payment securely with Razorpay: UPI, card or netbanking. We never see your card or UPI details." />
          {(() => {
            const ui = {
              idle: { Icon: CreditCard, tone: "text-muted-foreground bg-muted", title: "Nothing to pay yet", text: "Review your order in Checkout, then continue to payment." },
              starting: { Icon: Loader2, tone: "text-primary bg-primary/15", title: "Preparing your secure payment…", text: "Setting up your order with Razorpay." },
              waiting: { Icon: Lock, tone: "text-primary bg-primary/15", title: "Complete the payment in the Razorpay window", text: "Pay with UPI, card or netbanking. This page updates the moment it goes through." },
              closed: { Icon: XCircle, tone: "text-amber-600 bg-amber-500/15", title: "Payment not completed", text: pay.message ?? "Nothing was charged." },
              confirming: { Icon: Loader2, tone: "text-primary bg-primary/15", title: "Confirming your payment…", text: "This takes a few seconds. Please don't close or refresh this page." },
              done: { Icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/15", title: "Payment successful", text: pay.message ?? "Your subscription is active." },
              error: { Icon: AlertTriangle, tone: "text-destructive bg-destructive/10", title: "We couldn't complete the payment", text: pay.message ?? "Please try again." },
            }[pay.phase];
            const spin = pay.phase === "starting" || pay.phase === "confirming";
            const retry = pay.phase === "closed" || pay.phase === "error";
            const live = pay.phase === "starting" || pay.phase === "waiting";
            const recap = selected && summary && pay.phase !== "idle" && pay.phase !== "done" ? (
              <p className="rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-sm">
                <span className="font-bold">{selected.name}</span> · {interval === "yearly" ? "yearly" : "monthly"} · <span className="font-black tabular-nums">{formatMoney(summary.total, summary.currency)}</span> incl. GST
              </p>
            ) : null;
            // While the Razorpay form is open it is the whole step: no status bar above it.
            if (live) return null;
            return (
              <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-6 text-center" aria-live="polite">
                <span className={`flex size-16 items-center justify-center rounded-full ${ui.tone}`}><ui.Icon className={`size-8 ${spin ? "animate-spin" : ""}`} /></span>
                <div>
                  <h3 className="text-xl font-black tracking-tight">{ui.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{ui.text}</p>
                </div>
                {recap}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {retry && (
                    <Button type="button" disabled={busy} onClick={subscribeOrChange}>
                      <CreditCard className="size-4" /> Try payment again
                    </Button>
                  )}
                  {pay.phase === "idle" && <Button type="button" onClick={() => go("billing-checkout")}>Go to checkout</Button>}
                  {pay.phase === "done" ? (
                    <>
                      <a href="/commandos/settings/billing/invoices" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Receipt className="size-4" /> View receipt</a>
                      <Button type="button" variant="outline" onClick={() => go("billing-overview")}>Back to overview</Button>
                    </>
                  ) : (
                    pay.phase !== "idle" && pay.phase !== "confirming" && <Button type="button" variant="outline" onClick={() => go("billing-checkout")}>Back to checkout</Button>
                  )}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3" /> Secured by Razorpay · cancel any time</p>
              </div>
            );
          })()}
          {/* Razorpay Checkout opens in here, inside the step (see razorpay-checkout.ts); empty and flat until then. */}
          <div ref={payMount} className={`relative mx-auto mt-2 w-full max-w-[480px] overflow-hidden rounded-2xl ${pay.phase === "waiting" || pay.phase === "starting" ? "h-[clamp(560px,calc(100vh-170px),720px)] shadow-xl ring-1 ring-border" : "h-0"}`} aria-label="Secure payment with Razorpay">
            {pay.phase === "starting" && <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading the secure payment form…</p>}
          </div>
        </section>
      )}

      {usageSlot && (
        <section id="billing-usage-section" role="tabpanel" aria-labelledby="billing-usage-section-tab" style={show("billing-usage-section")} className="bl-section">
          <SectionHead step={6} icon={Zap} title="Your usage this month" desc="Every service in your plan against its allowance. Need more of anything? Move to the next plan." />
          <span id="billing-usage" className="sr-only">Usage</span>
          {usageSlot}
        </section>
      )}

      {confirming && (
        <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 flex max-w-sm flex-col items-center gap-3 rounded-3xl border border-border bg-card px-8 py-9 text-center shadow-2xl">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary"><Loader2 className="size-7 animate-spin" /></span>
            <p className="text-lg font-black tracking-tight">Confirming your payment…</p>
            <p className="text-sm text-muted-foreground">This takes a few seconds. Please don&apos;t close or refresh this page.</p>
          </div>
        </div>
      )}

      <Dialog open={detailsOpen} onOpenChange={(o) => !busy && setDetailsOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-6 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Billing details</DialogTitle>
            <DialogDescription>One last step before payment: these are printed on your GST invoices. Add your GSTIN to claim input tax credit.</DialogDescription>
          </DialogHeader>
          <BillingDetailsForm
            initial={details}
            save={actions.saveDetails}
            onSaved={(d) => {
              setDetails(d);
              setDetailsOpen(false);
              go("billing-payment");
              subscribeOrChange(); // straight on to payment
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Back / next, so the steps read as a path: overview → plans → checkout → usage → details. */}
      {(() => {
        const i = stepList.findIndex((x) => x.id === tab);
        const prev = i > 0 ? stepList[i - 1] : null;
        const next = i >= 0 && i < stepList.length - 1 ? stepList[i + 1] : null;
        if (!prev && !next) return null;
        return (
          <nav aria-label="Previous and next step" className="flex items-center justify-between gap-3">
            {prev ? <Button type="button" variant="ghost" onClick={() => go(prev.id)}><ArrowLeft className="size-4" /> {prev.label}</Button> : <span />}
            {next ? <Button type="button" variant="outline" onClick={() => go(next.id)}>{next.label} <ArrowRight className="size-4" /></Button> : <span />}
          </nav>
        );
      })()}
    </div>
  );
}
