"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgePercent, Building2, Check, Crown, Rocket, Sparkles, Sprout, Zap, type LucideIcon } from "lucide-react";
import { formatMoney, type BillingInterval } from "@/lib/platform/billing/types";
import { signupPlanHref, trialLabel } from "@/lib/platform/billing/signup-plan-rule";
import Countdown from "@/components/platform/saas/Countdown";
import type { ShowcasePlan } from "@/lib/platform/billing/showcase";

const PLAN_ICON: LucideIcon[] = [Sprout, Rocket, Zap, Building2, Crown];

/** The pricing cards. Only the plans, prices, limits and features the catalogue actually holds are shown. `compact` hides the allowance lists. */
export default function PricingPlans({ plans, compact = false, endsAt = null }: { plans: ShowcasePlan[]; compact?: boolean; endsAt?: number | null }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const hasYearly = plans.some((p) => p.kind === "paid" && p.offer.yearly);
  const price = (p: ShowcasePlan) => {
    if (p.kind === "contact") return { main: "Let's talk", unit: "", sub: "Custom for larger teams", list: null as string | null, pct: 0, save: null as string | null, equiv: null as string | null, yearSave: null as string | null };
    if (p.kind === "free") return { main: formatMoney(0, p.currency), unit: "forever", sub: "Free, with one person · no card needed", list: null, pct: 0, save: null, equiv: null, yearSave: null };
    const v = p.offer[interval] ?? p.offer.monthly;
    const l = p.list[interval];
    const has = !!(l && v && l > v);
    const m = p.offer.monthly;
    const y = p.offer.yearly;
    return {
      main: v == null ? "—" : formatMoney(v, p.currency),
      unit: interval === "yearly" ? "/ year" : "/ month",
      sub: "excl. taxes",
      list: has ? formatMoney(l as number, p.currency) : null,
      pct: has ? Math.round((1 - (v as number) / (l as number)) * 100) : 0,
      save: has ? formatMoney((l as number) - (v as number), p.currency) : null,
      equiv: interval === "yearly" && v ? formatMoney(Math.round(v / 12), p.currency) : null,
      yearSave: interval === "yearly" && m && y && m * 12 > y ? formatMoney(m * 12 - y, p.currency) : null,
    };
  };

  return (
    <div className="space-y-8">
      {hasYearly && (
        <div className="flex justify-center">
          <div className="relative inline-grid grid-cols-2 rounded-full border border-border/60 bg-background p-1.5 shadow-lg shadow-primary/5" role="tablist" aria-label="Billing period">
            <span className="absolute inset-y-1.5 left-1.5 w-[calc(50%-0.375rem)] rounded-full bg-foreground shadow-md transition-transform duration-300" style={{ transform: interval === "yearly" ? "translateX(100%)" : "none" }} aria-hidden />
            {(["monthly", "yearly"] as const).map((v) => (
              <button key={v} role="tab" aria-selected={interval === v} onClick={() => setInterval(v)} className={`relative z-10 rounded-full px-7 py-2 text-sm font-bold transition-colors ${interval === v ? "text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {v === "monthly" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid items-stretch gap-5 pt-6 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(225px,1fr))]">
        {plans.map((p, idx) => {
          const pr = price(p);
          const PIcon = PLAN_ICON[idx % PLAN_ICON.length];
          const pop = !!p.popular;
          const offer = pr.pct > 0;
          const tick = pop ? "bg-white text-[var(--primary)]" : "bg-primary/10 text-primary";
          const trial = p.kind === "paid" && p.trialDays > 0 ? trialLabel(p.trialDays) : null;
          const cta = p.kind === "contact" ? "Contact us" : p.kind === "free" ? "Start free forever" : trial ? `Try ${p.name} free for ${trial}` : `Get ${p.name}`;
          const href = p.kind === "contact" ? "/contact" : p.kind === "free" ? "/signup" : signupPlanHref(p.id, interval);
          return (
            <div key={p.id} className={`group relative flex flex-col overflow-hidden rounded-[2rem] transition-all duration-500 ${pop ? "sr-band text-white shadow-[0_40px_90px_-30px] shadow-primary/70 xl:-my-5" : "border border-border/60 bg-background shadow-sm hover:-translate-y-2 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/15"}`}>
              {/* the offer, stated first and plainly */}
              {offer ? (
                <div className={`sr-strip group/strip relative flex overflow-hidden whitespace-nowrap py-2.5 text-[11px] font-black uppercase tracking-[0.1em] ${pop ? "bg-white text-[var(--primary)]" : "bg-gradient-to-r from-primary to-brand-accent text-white"}`}>
                  <style>{`@keyframes sr-strip{from{transform:translateX(0)}to{transform:translateX(-50%)}}.sr-strip-track{animation:sr-strip 22s linear infinite}.group\\/strip:hover .sr-strip-track{animation-play-state:paused}@media (prefers-reduced-motion:reduce){.sr-strip-track{animation:none}.sr-strip-dup{display:none}}`}</style>
                  <div className="sr-strip-track flex flex-none items-center">
                    {[0, 1].map((k) => (
                      <div key={k} className={`flex flex-none items-center gap-3 pr-6 ${k === 1 ? "sr-strip-dup" : ""}`} aria-hidden={k === 1}>
                        <span className="inline-flex items-center gap-1.5"><BadgePercent className="h-4 w-4 flex-none" />{p.offerLabel || "Offer"}</span>
                        <span className="rounded-full bg-current/15 px-2 py-0.5">Save {pr.pct}%</span>
                        {endsAt && <span className="inline-flex items-center gap-1.5"><span className="text-[10px] opacity-80">Ends in</span><Countdown endsAt={endsAt} variant="mini" /></span>}
                        <span className="opacity-60">✦</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : pop ? (
                <div className="relative flex items-center justify-center gap-2 bg-white px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.14em] text-[var(--primary)]"><Sparkles className="h-4 w-4" />Most chosen</div>
              ) : (
                <span className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary to-brand-accent opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
              )}

              <div className={`relative flex flex-1 flex-col gap-6 p-7 ${pop ? "xl:py-10" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${pop ? "bg-white/15 ring-1 ring-white/30" : "sr-icon"}`}><PIcon className="h-6 w-6" /></span>
                  <div>
                    <h3 className="text-xl font-black leading-tight">{p.name}</h3>
                    {pop && offer && <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-white/80"><Sparkles className="h-3 w-3" />Most chosen</span>}
                  </div>
                </div>
                {p.description && <p className={`-mt-3 text-[14px] leading-snug ${pop ? "text-white/80" : "text-muted-foreground"}`}>{p.description}</p>}

                {/* price */}
                <div className={`rounded-2xl px-4 py-5 ${pop ? "bg-white/10 ring-1 ring-white/20" : "bg-muted/50"}`}>
                  {pr.list && (
                    <p className="mb-1 flex items-center gap-2.5">
                      <span className={`text-lg font-semibold line-through ${pop ? "text-white/60" : "text-muted-foreground"}`}>{pr.list}</span>
                      <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-black text-white">−{pr.pct}%</span>
                    </p>
                  )}
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`text-[2.6rem] font-black leading-none tracking-tighter ${pop ? "text-white" : "bg-gradient-to-br from-foreground to-foreground/65 bg-clip-text text-transparent"}`}>{pr.main}</span>
                    {pr.unit && <span className={`text-base font-bold ${pop ? "text-white/75" : "text-muted-foreground"}`}>{pr.unit}</span>}
                  </p>
                  <p className={`mt-2 text-[13px] ${pop ? "text-white/75" : "text-muted-foreground"}`}>{pr.sub}</p>
                  {pr.equiv && <p className={`mt-1.5 text-[13px] font-semibold ${pop ? "text-white" : "text-foreground"}`}>That&apos;s {pr.equiv} a month, billed yearly</p>}
                  {(pr.save || pr.yearSave) && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[12px] font-bold text-emerald-500"><Check className="h-3.5 w-3.5" strokeWidth={3} />{pr.yearSave && interval === "yearly" ? `You save ${pr.yearSave} vs monthly` : `You save ${pr.save}`}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Link href={href} className={`group/b inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-4 text-sm font-black transition-all hover:scale-[1.03] ${pop ? "bg-white text-black shadow-xl" : "bg-foreground text-background shadow-lg hover:shadow-xl"}`}>
                    {cta}<ArrowRight className="h-4 w-4 transition-transform group-hover/b:translate-x-1" />
                  </Link>
                  {trial && <p className={`text-center text-xs font-medium ${pop ? "text-white/75" : "text-muted-foreground"}`}>No card needed · then {pr.main}{pr.unit ? ` ${pr.unit}` : ""} · cancel any time</p>}
                  <Link href={`/pricing/${p.id}`} className={`group/l inline-flex items-center justify-center gap-1.5 py-1.5 text-sm font-bold ${pop ? "text-white" : "text-primary"}`}>View details <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/l:translate-x-1" /></Link>
                </div>

                <ul className={`space-y-3.5 border-t pt-6 text-[14px] ${pop ? "border-white/20" : "border-border/60"}`}>
                  <li className="flex gap-3"><span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${pop ? tick : "sr-circle"}`}><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span><span className="font-bold">{p.seats ? `Up to ${p.seats.toLocaleString("en-IN")} ${p.seats === 1 ? "user" : "users"}` : "Unlimited users"}</span></li>
                  <li className="flex gap-3"><span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${pop ? tick : "sr-circle"}`}><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span><span className="font-semibold">{p.panels}</span></li>
                  {!compact && p.limits.filter((l) => l.included).map((l) => (
                    <li key={l.key} className="flex gap-3"><span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${tick}`}><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span><span>{l.label}: <span className="font-bold">{l.value}</span></span></li>
                  ))}
                  {!compact && p.flags.map((f) => (
                    <li key={f} className="flex gap-3"><span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${tick}`}><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span><span>{f}</span></li>
                  ))}
                  {!compact && p.highlights.map((h) => (
                    <li key={h} className="flex gap-3"><span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full ${tick}`}><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span><span>{h}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
