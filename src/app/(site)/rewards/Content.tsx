"use client";

import Link from "next/link";
import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, BadgePercent, CalendarClock, CheckCircle2, ChevronDown, Coins, Gift, Info, ListChecks, Repeat, Sparkles, Ticket, Wallet } from "lucide-react";
import type { AudienceGuide, RewardsGuide } from "@/lib/wallet/guide";
import type { GuideAudience } from "@/lib/wallet/earn-guide";

import { brandify } from "@/lib/brand";
import { useText } from "@/components/products/sitecraft-ai/TextContext";
import { BrandName } from "@/components/platform/BrandProvider";
const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } };
const stagger = { visible: { transition: { staggerChildren: 0.1 } } };
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const card = "rounded-2xl border border-border/50 bg-muted/30 p-6";

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mb-10 max-w-3xl">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h2>
      {body && <p className="mt-3 text-lg text-muted-foreground">{body}</p>}
    </div>
  );
}

export default function RewardsContent({
  guide,
  signedIn,
  defaultAudience,
  faqs,
}: {
  guide: RewardsGuide;
  signedIn: boolean;
  defaultAudience: string;
  faqs: { question: string; answer: string }[];
}) {
  const tx = useText();
  const start = (guide.audiences.some((a) => a.id === defaultAudience) ? defaultAudience : "trainee") as GuideAudience;
  const [aud, setAud] = React.useState<GuideAudience>(start);
  const a = guide.audiences.find((x) => x.id === aud) as AudienceGuide;
  const offersUsage = a.usage.find((u) => u.module === "offers");

  // Worked example for the stacking explanation (clearly labelled as an example).
  const price = 10000;
  const offerOff = price * 0.1;
  const couponOff = price * 0.05;
  const afterDiscounts = price - offerOff - couponOff;
  const exampleBalance = 1000; // assumed wallet balance for the illustration
  const creditCap = offersUsage?.allowed ? Math.min(exampleBalance, Math.floor((afterDiscounts * offersUsage.maxPercent) / 100)) : 0;

  return (
    <div className="flex min-h-screen flex-col overflow-hidden">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/50 bg-background pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pt-36">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-[10%] -top-[20%] h-[60%] w-[60%] animate-blob rounded-full bg-primary/10 blur-[120px] mix-blend-multiply dark:mix-blend-screen" />
          <div className="animation-delay-2000 absolute right-[5%] top-[10%] h-[50%] w-[50%] animate-blob rounded-full bg-secondary/15 blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
          <div className="animation-delay-4000 absolute -bottom-[20%] left-[20%] h-[70%] w-[70%] animate-blob rounded-full bg-brand-accent/15 blur-[140px] mix-blend-multiply dark:mix-blend-screen" />
          <div className="absolute inset-0 bg-grid-slate-900/[0.02] [mask-image:linear-gradient(to_bottom,black,transparent)] dark:bg-grid-slate-400/[0.02]" />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="max-w-3xl">
            <motion.div variants={fadeIn} className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-4 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur-md">
              <Coins className="h-4 w-4 text-primary" /> <span>{tx("rewards.content.1-yo-credit-1-off")}</span>
            </motion.div>
            <motion.h1 variants={fadeIn} className="mb-6 text-5xl font-black leading-[1.1] tracking-tight text-foreground sm:text-6xl">
              {tx("rewards.content.ways-to-earn")}<span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">{tx("rewards.content.yo-credits")}</span>
            </motion.h1>
            <motion.p variants={fadeIn} className="text-xl leading-8 text-muted-foreground">
              {tx("rewards.content.earn-credits-for-signing-up-completing-e")}</motion.p>
            <motion.div variants={fadeIn} className="mt-8 flex flex-wrap gap-3">
              <Link href={signedIn ? "/clientos/wallet" : "/register"} className="group inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90">
                {signedIn ? "Open my wallet" : "Create free account"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/offers" className="inline-flex items-center gap-2 rounded-xl border border-border px-7 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary">
                {tx("rewards.content.see-live-offers")}</Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-background py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <SectionHead eyebrow={tx("rewards.content.how-it-works")} title={tx("rewards.content.earn-track-use")} />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: Sparkles, t: tx("rewards.content.1-earn"), b: tx("rewards.content.sign-up-and-complete-activities-credits-") },
              { icon: Wallet, t: tx("rewards.content.2-track"), b: tx("rewards.content.your-wallet-shows-your-balance-every-tra") },
              { icon: BadgePercent, t: tx("rewards.content.3-use"), b: tx("rewards.content.apply-credits-on-offers-course-fees-and-") },
            ].map(({ icon: Icon, t, b }) => (
              <div key={t} className={card}>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-6 w-6 text-primary" /></div>
                <h3 className="text-lg font-semibold text-foreground">{t}</h3>
                <p className="mt-1 text-muted-foreground">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BY USER TYPE */}
      <section className="border-y border-border/50 bg-muted/10 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <SectionHead eyebrow={tx("rewards.content.by-account-type")} title={tx("rewards.content.what-you-can-earn")} body="Pick your account type — amounts are the live rewards for that type." />
          <div role="tablist" aria-label="Account type" className="mb-8 flex flex-wrap gap-2">
            {guide.audiences.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === aud} onClick={() => setAud(x.id)} className={`rounded-full border px-5 py-2 text-sm font-semibold transition-colors ${x.id === aud ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"}`}>
                {x.label}
              </button>
            ))}
          </div>

          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <p className="max-w-2xl text-muted-foreground">{a.blurb}</p>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tx("rewards.content.earn-up-to")}</p>
              <p className="text-3xl font-black tabular-nums text-primary">{a.potential.toLocaleString("en-IN")} <span className="text-base font-bold">{tx("rewards.content.credits")}</span></p>
              <p className="text-xs text-muted-foreground">{tx("rewards.content.from-one-time-rewards-journey-stages-bef")}</p>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {a.ways.map((w) => (
              <div key={`${w.type}-${w.title}`} className={card}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-foreground">{w.title}</h3>
                  <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-bold tabular-nums text-primary">+{w.amount.toLocaleString("en-IN")}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground"><Repeat className="h-3 w-3" /> {w.frequency}</span>
                  {w.expiresInDays && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground"><CalendarClock className="h-3 w-3" />{tx("rewards.content.valid")}{w.expiresInDays}{tx("rewards.content.days")}</span>}
                </div>
                <p className="mt-4 text-sm"><span className="font-semibold text-foreground">{tx("rewards.content.when-you-get-it")}</span><span className="text-muted-foreground">{brandify(w.when)}</span></p>
                <div className="mt-3">
                  <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground"><ListChecks className="h-4 w-4 text-primary" />{tx("rewards.content.what-to-complete")}</p>
                  <ol className="space-y-1 text-sm text-muted-foreground">
                    {w.steps.map((s, i) => (
                      <li key={i} className="flex gap-2"><span className="font-semibold text-primary">{i + 1}.</span> {brandify(s)}</li>
                    ))}
                  </ol>
                </div>
                {w.note && <p className="mt-3 flex gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {brandify(w.note)}</p>}
              </div>
            ))}
          </div>

          {a.stages.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-1 text-xl font-bold text-foreground">{tx("rewards.content.journey-stage-rewards")}</h3>
              <p className="mb-4 text-muted-foreground">{tx("rewards.content.you-earn-each-time-our-team-completes-on")}</p>
              <div className="overflow-x-auto rounded-2xl border border-border/50">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-5 py-3 font-semibold">{tx("rewards.content.stage-completed")}</th><th className="px-5 py-3 text-right font-semibold">{tx("rewards.content.credits-2")}</th></tr>
                  </thead>
                  <tbody>
                    {a.stages.map((s) => (
                      <tr key={s.key} className="border-t border-border/40">
                        <td className="px-5 py-3 text-foreground">{s.label}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums text-primary">+{s.amount.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className={card}>
              <h3 className="mb-1 flex items-center gap-2 text-xl font-bold text-foreground"><Gift className="h-5 w-5 text-primary" />{tx("rewards.content.referral-program")}</h3>
              {a.referral.state === "off" ? (
                <p className="text-muted-foreground">{tx("rewards.content.referrals-are-paused-for-this-account-ty")}</p>
              ) : (
                <>
                  <p className="text-muted-foreground">{tx("rewards.content.share-your-link-from-portal-referrals")}{a.referral.campaignName ? <>{tx("rewards.content.current-campaign")}<strong className="text-foreground">{a.referral.campaignName}</strong>.</> : null}</p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{tx("rewards.content.you-earn")}</dt><dd className="font-bold text-primary">+{a.referral.referrer.toLocaleString("en-IN")}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{tx("rewards.content.your-friend-earns")}</dt><dd className="font-bold text-primary">+{a.referral.referee.toLocaleString("en-IN")}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{tx("rewards.content.paid-when")}</dt><dd className="text-right font-medium text-foreground">{a.referral.event}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{tx("rewards.content.max-referrals-per-person")}</dt><dd className="font-medium text-foreground">{a.referral.cap}</dd></div>
                  </dl>
                  <p className="mt-4 text-xs text-muted-foreground">{tx("rewards.content.self-referrals-duplicate-accounts-and-un")}</p>
                </>
              )}
            </div>

            <div className={card}>
              <h3 className="mb-1 flex items-center gap-2 text-xl font-bold text-foreground"><Wallet className="h-5 w-5 text-primary" />{tx("rewards.content.where-you-can-use-credits")}</h3>
              <p className="mb-3 text-muted-foreground">{tx("rewards.content.limits-for")}{a.label.toLowerCase()}{tx("rewards.content.accounts")}</p>
              <ul className="space-y-2.5 text-sm">
                {a.usage.map((u) => (
                  <li key={u.module} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2.5 last:border-0">
                    <span className="font-medium text-foreground">{u.label}</span>
                    {u.allowed ? (
                      <span className="text-right text-muted-foreground">
                        {tx("rewards.content.up-to")}<strong className="text-foreground">{u.maxPercent}%</strong>{tx("rewards.content.of-the-amount")}{u.maxPerUse ? `, max ${u.maxPerUse.toLocaleString("en-IN")} credits per use` : ""}
                        {u.minOrder ? `, min order ${inr(u.minOrder)}` : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{tx("rewards.content.not-available-yet")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* OFFERS & COUPONS */}
      <section className="bg-background py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <SectionHead eyebrow={tx("rewards.content.offers-coupons")} title={tx("rewards.content.how-to-use-offers-coupon-codes-and-credi")} body="Apply them in this order — each one only reduces what's left." />

          <div className="grid gap-5 lg:grid-cols-3">
            <div className={card}>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground"><Sparkles className="h-5 w-5 text-primary" />{tx("rewards.content.1-festival-offer")}</h3>
              <ol className="space-y-1.5 text-sm text-muted-foreground">
                <li>{tx("rewards.content.1-open-the")}<Link href="/offers" className="font-medium text-primary underline">{tx("rewards.content.offers-page")}</Link>{tx("rewards.content.while-a-campaign-is-live")}</li>
                <li>{tx("rewards.content.2-choose-the-offer-for-your-service-and-")}<em>{tx("rewards.content.claim")}</em>.</li>
                <li>{tx("rewards.content.3-fill-the-short-claim-form-name-email-p")}</li>
                <li>{tx("rewards.content.4-the-offer-discount-is-calculated-on-ou")}</li>
              </ol>
            </div>
            <div className={card}>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground"><Ticket className="h-5 w-5 text-primary" />{tx("rewards.content.2-coupon-code")}</h3>
              <ol className="space-y-1.5 text-sm text-muted-foreground">
                <li>{tx("rewards.content.1-in-the-claim-form-find-the")}<em>{tx("rewards.content.coupon-code")}</em>{tx("rewards.content.box")}</li>
                <li>{tx("rewards.content.2-type-your-code-and-press")}<em>{tx("rewards.content.apply")}</em>{tx("rewards.content.to-preview-the-extra-saving")}</li>
                <li>{tx("rewards.content.3-coupons-stack-with-the-offer-the-total")}</li>
                <li>{tx("rewards.content.4-each-coupon-has-its-own-rules-below-it")}</li>
              </ol>
            </div>
            <div className={card}>
              <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground"><Coins className="h-5 w-5 text-primary" />{tx("rewards.content.3-your-credits")}</h3>
              <ol className="space-y-1.5 text-sm text-muted-foreground">
                <li>{tx("rewards.content.1-sign-in-first-credits-are-only-used-by")}</li>
                <li>{tx("rewards.content.2-use-the")}<em>{tx("rewards.content.same-email")}</em>{tx("rewards.content.as-your-account-in-the-claim-form")}</li>
                <li>{tx("rewards.content.3-tick")}<em>{tx("rewards.content.use-my")}<BrandName />{tx("rewards.content.credits-3")}</em>.</li>
                <li>{tx("rewards.content.4-credits-cover-part-of-what-remains-up-")}</li>
              </ol>
            </div>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <div className={card}>
              <h3 className="mb-3 text-lg font-semibold text-foreground">{tx("rewards.content.coupon-rules-to-check")}</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  ["Validity", "A coupon works only between its start and end date, and only while it is active."],
                  ["Who / what", "Some coupons are for a specific audience (student, intern, client, hiring) or a specific service."],
                  ["Minimum order", "Some need a minimum order value before they apply."],
                  ["Cap", "Percentage coupons can have a maximum discount amount."],
                  ["Limits", "Coupons can have a total usage limit and a per-person limit — once used up they stop working."],
                  ["Campaign", "A coupon can be tied to one campaign and won't work in another."],
                ].map(([k, v]) => (
                  <li key={k} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong className="text-foreground">{k}:</strong> {v}</span></li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">{tx("rewards.content.coupon-codes-are-shared-through-campaign")}</p>
            </div>

            <div className={card}>
              <h3 className="mb-1 text-lg font-semibold text-foreground">{tx("rewards.content.worked-example")}</h3>
              <p className="mb-3 text-xs text-muted-foreground">{tx("rewards.content.illustration-only-real-amounts-depend-on")}{a.label}).</p>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">{tx("rewards.content.original-price")}</dt><dd className="tabular-nums text-foreground">{inr(price)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{tx("rewards.content.offer-10-off")}</dt><dd className="tabular-nums text-green-600 dark:text-green-400">− {inr(offerOff)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{tx("rewards.content.coupon-5-of-original-price")}</dt><dd className="tabular-nums text-green-600 dark:text-green-400">− {inr(couponOff)}</dd></div>
                <div className="flex justify-between border-t border-border/50 pt-2"><dt className="font-medium text-foreground">{tx("rewards.content.after-offer-coupon")}</dt><dd className="font-semibold tabular-nums text-foreground">{inr(afterDiscounts)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{tx("rewards.content.credits-used-say-you-have")}{exampleBalance.toLocaleString("en-IN")}{tx("rewards.content.limit")}{offersUsage?.allowed ? `${offersUsage.maxPercent}%` : "none"})</dt><dd className="tabular-nums text-green-600 dark:text-green-400">− {inr(creditCap)}</dd></div>
                <div className="flex justify-between border-t border-border/50 pt-2 text-base"><dt className="font-bold text-foreground">{tx("rewards.content.you-pay")}</dt><dd className="font-black tabular-nums text-primary">{inr(afterDiscounts - creditCap)}</dd></div>
              </dl>
            </div>
          </div>

          {guide.offers.campaign && (
            <div className="mt-8">
              <h3 className="mb-1 text-xl font-bold text-foreground">{tx("rewards.content.live-now")}{guide.offers.campaign.name}</h3>
              <p className="mb-4 text-muted-foreground">{tx("rewards.content.ends")}{new Date(guide.offers.campaign.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {guide.offers.items.map((o) => (
                  <Link key={o.id} href={o.href} className={`${card} block transition-colors hover:border-primary/40`}>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{o.badge}</span>
                    <p className="mt-3 font-semibold text-foreground">{o.title}</p>
                    <p className="text-xs text-muted-foreground">{o.category}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* RULES */}
      <section className="border-y border-border/50 bg-muted/10 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <SectionHead eyebrow={tx("rewards.content.good-to-know")} title={tx("rewards.content.credit-rules-at-a-glance")} />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { t: tx("rewards.content.promotional"), b: tx("rewards.content.credits-are-rewards-not-money-no-cash-ou") },
              { t: tx("rewards.content.expiry"), b: tx("rewards.content.each-reward-has-a-validity-oldest-credit") },
              { t: tx("rewards.content.paid-once-per-event"), b: tx("rewards.content.nothing-pays-twice-for-the-same-step-ret") },
              { t: tx("rewards.content.fair-use"), b: tx("rewards.content.credits-earned-through-misuse-or-fake-re") },
            ].map((x) => (
              <div key={x.t} className={card}>
                <h3 className="font-semibold text-foreground">{x.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{x.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-background py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <SectionHead eyebrow={tx("rewards.content.faq")} title={tx("rewards.content.questions-about-credits")} />
          <div className="space-y-3">
            {faqs.map((f) => (
              <details key={f.question} className="group rounded-2xl border border-border/50 bg-muted/30 p-5 open:bg-muted/50">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-foreground">
                  {brandify(f.question)}
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-muted-foreground">{brandify(f.answer)}</p>
              </details>
            ))}
          </div>

          <div className="mt-12 rounded-3xl border border-primary/20 bg-primary/5 p-8 text-center">
            <h3 className="text-2xl font-bold text-foreground">{tx("rewards.content.ready-to-start-earning")}</h3>
            <p className="mx-auto mt-2 max-w-xl text-muted-foreground">{tx("rewards.content.create-your-free-account-and-your-welcom")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={signedIn ? "/clientos/wallet" : "/register"} className="inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90">
                {signedIn ? "Open my wallet" : "Create free account"} <ArrowRight className="h-4 w-4" />
              </Link>
              {!signedIn && <Link href="/login" className="inline-flex items-center rounded-xl border border-border px-7 py-3.5 text-sm font-semibold text-foreground hover:border-primary hover:text-primary">{tx("rewards.content.log-in")}</Link>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
