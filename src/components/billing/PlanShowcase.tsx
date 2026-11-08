"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Building2, Check, Crown, Gift, Globe, HardDrive, Mail, MessageSquare, Mic, Minus, Rocket, Sparkles, Users, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, type BillingInterval } from "@/lib/platform/billing/types";
import type { ShowcasePlan } from "@/lib/platform/billing/showcase";
import { DOWNGRADE_MESSAGE, isPlanDowngrade } from "@/lib/platform/billing/plan-order-rule";

/**
 * The pricing screens: a sliding Monthly / Yearly switch, a "how many people?" slider that points at the plan that fits, and a card per plan
 * with a spotlight that follows the pointer, an offer ribbon, a price that counts to its new value, the usual price struck through, and a bar
 * for every service allowance. One component for the marketing page and the in-app plan chooser; colours come from the theme tokens, so each
 * takes the look of where it is shown. Animations stop under reduced motion.
 */
export interface PlanShowcaseProps {
  plans: ShowcasePlan[];
  /** The plan in use (in-app): its button reads "Current plan". */
  currentPlanId?: string | null;
  defaultInterval?: BillingInterval;
  /** In-app, during a free trial: the plan being tried can be bought as it is ("Subscribe"), not only a higher one. */
  allowCurrent?: boolean;
  /** In-app: plans below the current one are shown as not available (a company can only move up). */
  blockDowngrade?: boolean;
  /** In-app: choosing a plan calls this (the checkout lives elsewhere). */
  onSelect?: (planId: string, interval: BillingInterval) => void;
  /** Marketing: where the buttons go. */
  signupHref?: string;
  contactHref?: string;
}

const PLAN_ICON: Record<string, LucideIcon> = { free: Gift, starter: Sparkles, growth: Rocket, business: Building2, enterprise: Crown };
const SERVICE_ICON: Record<string, LucideIcon> = { storageMb: HardDrive, aiTokensPerMonth: Bot, emailsPerMonth: Mail, voiceMinutesPerMonth: Mic, customDomains: Globe };

const money = (paise: number, currency: string) => formatMoney(paise, currency);
/** The plan's monthly price for ordering plans (a "contact us" plan has none and counts as the highest). */
const monthlyOf = (p: ShowcasePlan | undefined): number | null => (!p ? 0 : p.kind === "contact" ? null : (p.offer.monthly ?? 0));

/** A number that counts from where it was to its new value (instantly under reduced motion). */
function useCountTo(target: number): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 550);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(start + (target - start) * eased);
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

function PriceBlock({ p, interval }: { p: ShowcasePlan; interval: BillingInterval }) {
  const offer = p.offer[interval];
  const perMonth = p.kind === "paid" && offer !== null ? (interval === "yearly" ? Math.round(offer / 12) : offer) : 0;
  const shown = useCountTo(perMonth);
  if (p.kind === "contact") return <p className="pc-price-text">Contact support</p>;
  if (p.kind === "free") return <p><span className="pc-price">{money(0, p.currency)}</span> <span className="pc-per">forever</span></p>;
  if (offer === null) return <p className="text-sm text-muted-foreground">Not offered {interval === "yearly" ? "yearly" : "monthly"}</p>;
  const list = p.list[interval];
  const listPerMonth = list !== null ? (interval === "yearly" ? Math.round(list / 12) : list) : null;
  const saved = list !== null && list > offer ? list - offer : 0;
  const off = list !== null && list > offer ? Math.round((1 - offer / list) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        {listPerMonth !== null && listPerMonth > perMonth && <span className="pc-was" aria-label={`Usual price ${money(listPerMonth, p.currency)}`}>{money(listPerMonth, p.currency)}</span>}
        <span className="pc-price">{money(shown, p.currency)}</span>
        <span className="pc-per">/ month</span>
      </p>
      {interval === "yearly" && <p className="text-xs text-muted-foreground">Billed {money(offer, p.currency)} a year</p>}
      {saved > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <span className="pc-off">{off}% OFF</span>
          Save {money(saved, p.currency)} {interval === "yearly" ? "a year" : "a month"}
        </p>
      )}
    </div>
  );
}

export default function PlanShowcase({ plans, currentPlanId, defaultInterval = "monthly", onSelect, blockDowngrade = false, allowCurrent = false, signupHref = "/signup", contactHref = "/contact" }: PlanShowcaseProps) {
  const [interval, setInterval] = useState<BillingInterval>(defaultInterval);
  const [team, setTeam] = useState(5);
  const hasYearly = plans.some((p) => p.kind === "paid" && p.offer.yearly !== null);
  const yearlyBest = Math.max(0, ...plans.filter((p) => p.kind === "paid" && p.offer.monthly && p.offer.yearly).map((p) => Math.round((1 - (p.offer.yearly as number) / ((p.offer.monthly as number) * 12)) * 100)));
  const maxSeats = Math.max(...plans.map((p) => p.seats ?? 0), 10);
  const fit = useMemo(() => plans.find((p) => p.seats === null || p.seats >= team) ?? plans[plans.length - 1], [plans, team]);
  const maxByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plans) for (const l of p.limits) if (l.raw !== null) m.set(l.key, Math.max(m.get(l.key) ?? 0, l.raw));
    return m;
  }, [plans]);

  return (
    <div className="pc-wrap space-y-10">
      <div className="flex flex-col items-center gap-6">
        {hasYearly && (
          <div className="pc-switch" role="group" aria-label="Billing cycle" data-yearly={interval === "yearly"}>
            <span className="pc-switch-pill" aria-hidden />
            {(["monthly", "yearly"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={interval === c} onClick={() => setInterval(c)} className={cn("pc-switch-btn", interval === c && "is-on")}>
                {c === "monthly" ? "Monthly" : "Yearly"}
                {c === "yearly" && yearlyBest > 0 && <span className="pc-save">Save {yearlyBest}%</span>}
              </button>
            ))}
          </div>
        )}
        <div className="pc-fit w-full max-w-xl">
          <div className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor="pc-team" className="inline-flex items-center gap-2 font-semibold"><Users className="size-4 text-primary" /> How many people will use it?</label>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-black text-primary tabular-nums">{team >= maxSeats ? `${maxSeats}+` : team}</span>
          </div>
          <input id="pc-team" type="range" min={1} max={maxSeats} value={team} onChange={(e) => setTeam(Number(e.target.value))} className="pc-range" style={{ ["--pc-fill" as string]: `${((team - 1) / (maxSeats - 1)) * 100}%` }} />
          <p className="text-center text-sm text-muted-foreground" aria-live="polite">Best fit: <b className="text-foreground">{fit?.name}</b>{fit?.kind === "contact" ? " (talk to us)" : fit?.kind === "free" ? " (free for life)" : ""}</p>
        </div>
      </div>

      <div className="pc-grid">
        {plans.map((p) => {
          const current = currentPlanId === p.id;
          const lower = !!blockDowngrade && !current && isPlanDowngrade(monthlyOf(plans.find((x) => x.id === currentPlanId)), monthlyOf(p));
          const isFit = fit?.id === p.id;
          const Icon = PLAN_ICON[p.id] ?? Zap;
          return (
            <div
              key={p.id}
              className={cn("pc-card", (p.popular || isFit) && "has-badge", p.popular && "is-popular", isFit && "is-fit", current && "is-current")}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
                e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
              }}
            >
              {p.popular && <span className="pc-popular"><Sparkles className="size-3" /> Most popular</span>}
              {isFit && !p.popular && <span className="pc-popular pc-fitbadge">Best fit</span>}
              <div className="flex items-center gap-3">
                <span className="pc-icon"><Icon className="size-5" /></span>
                <div className="min-w-0">
                  <h3 className="text-lg font-black leading-tight">{p.name}</h3>
                  {p.offerLabel && p.kind === "paid" && <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">{p.offerLabel}</span>}
                </div>
              </div>
              <p className="min-h-[2.75rem] text-sm text-muted-foreground">{p.description}</p>
              <div className="min-h-[6.5rem]"><PriceBlock p={p} interval={interval} /></div>

              {onSelect ? (
                p.kind === "contact" ? (
                  <Link href={contactHref} className="pc-btn pc-btn-ghost">Contact support</Link>
                ) : (
                  <button type="button" disabled={(current && !allowCurrent) || lower || p.kind === "free"} title={lower ? DOWNGRADE_MESSAGE : undefined} onClick={() => onSelect(p.id, interval)} className={cn("pc-btn", current && !allowCurrent ? "pc-btn-current" : lower || p.kind === "free" ? "pc-btn-ghost" : "pc-btn-primary")}>
                    {current && allowCurrent ? `Subscribe to ${p.name}` : current ? "Current plan" : lower ? "Not available" : p.kind === "free" ? "Free plan" : "Choose plan"}
                  </button>
                )
              ) : (
                <Link href={p.kind === "contact" ? contactHref : `${signupHref}${p.kind === "paid" ? `?plan=${p.id}` : ""}`} className={cn("pc-btn", p.kind === "paid" ? "pc-btn-primary" : "pc-btn-ghost")}>
                  {p.kind === "contact" ? "Contact support" : p.kind === "free" ? "Start free" : "Get started"}
                </Link>
              )}

              <ul className="space-y-2.5 text-sm">
                <li className="flex items-center gap-2.5 font-bold"><Users className="size-4 text-primary" />{p.seats === null ? "Unlimited users" : p.seats === 1 ? "1 user" : `Up to ${p.seats.toLocaleString("en-IN")} users`}</li>
                <li className="flex items-center gap-2.5"><Check className="size-4 shrink-0 text-primary" />{p.panels}</li>
                {p.highlights.map((h) => <li key={h} className="flex items-center gap-2.5"><Check className="size-4 shrink-0 text-primary" />{h}</li>)}
                <li className="pc-rule" aria-hidden />
                {p.limits.map((l) => {
                  const SI = SERVICE_ICON[l.key] ?? Zap;
                  const max = maxByKey.get(l.key) ?? 0;
                  const pct = !l.included ? 0 : l.raw === null ? 100 : max > 0 ? Math.max(6, Math.round((l.raw / max) * 100)) : 0;
                  return (
                    <li key={l.key} className={cn("pc-row", !l.included && "opacity-50")} title={`${l.label}: ${l.value}`}>
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground"><SI className="size-3.5 shrink-0" /><span className="truncate">{l.short}</span></span>
                      <b className="tabular-nums">{l.shortValue}</b>
                      <div className="pc-bar" aria-hidden><span style={{ width: `${pct}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <details className="pc-compare group rounded-3xl border border-border bg-card/80">
        <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-base font-black">
          Compare every limit
          <span className="text-sm font-semibold text-primary group-open:hidden">Show</span>
          <span className="hidden text-sm font-semibold text-primary group-open:inline">Hide</span>
        </summary>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3 font-semibold">Service</th>
                {plans.map((p) => <th key={p.id} className="px-4 py-3 font-bold">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/60"><th scope="row" className="px-6 py-3 text-left font-semibold">Users</th>{plans.map((p) => <td key={p.id} className="px-4 py-3 font-semibold">{p.seats === null ? "Unlimited" : p.seats.toLocaleString("en-IN")}</td>)}</tr>
              {plans[0]?.limits.map((row, i) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-6 py-3 text-left font-semibold">{row.label}{row.provider ? <span className="block text-xs font-normal text-muted-foreground">via {row.provider}</span> : null}</th>
                  {plans.map((p) => { const l = p.limits[i]; return <td key={p.id} className={cn("px-4 py-3", l.included ? "" : "text-muted-foreground")}>{l.included ? l.value : <span className="inline-flex items-center gap-1"><Minus className="size-3.5" /> {l.value}</span>}</td>; })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="mx-auto max-w-3xl text-center text-sm text-muted-foreground">Every plan includes every product and feature. Plans differ only in how many people and how much storage, AI, email, voice and domains. Need more of anything? Move to the next plan. Prices exclude GST.</p>
    </div>
  );
}
