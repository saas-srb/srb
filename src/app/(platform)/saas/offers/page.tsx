import { breadcrumbList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import StackCompare from "@/components/platform/saas/StackCompare";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgePercent, Check, Gift, Infinity as InfinityIcon, Layers, PiggyBank, Sparkles, Star } from "lucide-react";
import { getOffers } from "@/lib/platform/saas/offers";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { CtaBand, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import { TimelineSteps } from "@/components/platform/saas/Modern";
import Countdown from "@/components/platform/saas/Countdown";
import SavingsCalculator from "@/components/platform/saas/SavingsCalculator";
import FaqSection from "@/components/platform/saas/FaqSection";
import Reveal from "@/components/platform/saas/Reveal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/offers", title: "Launch Offer on Every Paid Plan", description: "The current SelfRun AI launch offer on paid plans, with its real end date. Every plan includes every product and every feature, starting free.", keywords: ["business software offer", "SaaS launch offer", "discount on business software", "CRM software deal", "SaaS pricing offer", "limited time software offer"], tag: "Offer" });

export default async function OffersPage() {
  const [o, modules] = await Promise.all([getOffers(), getFeatureModules()]);
  const yearly = o.yearly;
  const topYearly = yearly.reduce<(typeof yearly)[number] | null>((a, b) => (!a || (b.yearly?.pct ?? 0) > (a.yearly?.pct ?? 0) ? b : a), null);
  return (
    <>
      <JsonLd data={[webPage({ type: "WebPage", path: "/offers", name: "Offers", description: "The current SelfRun AI launch offer on paid plans, with its real end date. Every plan includes every product and every feature, starting free." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Offers", path: "/offers" }])]} />
      <PageHero
        art="pricing"
        eyebrow={o.topPct > 0 ? o.label : "Offers"}
        title={o.topPct > 0 ? `Save up to ${o.topPct}%` : "Free forever."}
        accent={o.topPct > 0 ? "on every paid plan." : "Pay only as your team grows."}
        lead={`Every plan includes every product, with every feature. The prices below are the prices you pay — plus a free plan that is free forever.`}
        photo="success" shot="fms" shotName="Finance"
      >
        {o.endsAt && (
          <div className="mb-8 w-full">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">The offer ends in</p>
            <Countdown endsAt={o.endsAt} />
          </div>
        )}
        <HeroCtas primary={{ label: o.topPct > 0 ? "Claim the offer — start free" : "Start free", href: "/signup" }} secondary={{ label: "Compare plans", href: "/pricing" }} />
      </PageHero>

      {/* the four kinds of offer */}
      <section className="sr-section">
        <div className="sr-container">
          <SectionHead icon="wallet" eyebrow="Ways to save" title="Four offers," accent="one platform." lead="Pick the one that fits your team today — you can change plans as you grow." />
          <div className="grid gap-6 lg:grid-cols-6">
            {/* launch */}
            <Reveal className="lg:col-span-4">
              <div className="sr-band relative h-full overflow-hidden rounded-[2.25rem] p-8 shadow-2xl shadow-primary/30 sm:p-10">
                <div className="relative flex h-full flex-col justify-between gap-8">
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.16em] ring-1 ring-white/30"><BadgePercent className="h-4 w-4" />{o.topPct > 0 ? o.label : "Simple pricing"}</span>
                    {o.topPct > 0 ? (
                      <p className="mt-5 text-8xl font-black leading-none tracking-tighter sm:text-9xl">{o.topPct}<span className="text-5xl sm:text-6xl">% off</span></p>
                    ) : (
                      <p className="mt-5 text-5xl font-black tracking-tight">{o.from ? <>From {o.from.price}<span className="text-2xl font-bold text-white/75"> / month</span></> : "Simple pricing"}</p>
                    )}
                    <p className="mt-4 max-w-md text-lg text-white/85">{o.topPct > 0 ? `The most you save is on ${o.topPlan}. Every paid plan is below its list price.` : (o.from ? `Paid plans start at ${o.from.price} a month (${o.from.name}), and the price you see is the price you pay.` : "The price you see is the price you pay.")} Nothing is held back: every product and every feature is in.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href="/signup" className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-black text-black shadow-xl transition-transform hover:scale-105">{o.topPct > 0 ? "Claim this offer" : "Start free"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                    <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-7 py-3.5 text-sm font-bold backdrop-blur hover:bg-white/20">See every plan</Link>
                  </div>
                </div>
              </div>
            </Reveal>
            {/* free */}
            <Reveal delay={80} className="lg:col-span-2">
              <div className="relative h-full overflow-hidden rounded-[2.25rem] border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.12] via-background to-background p-8 shadow-sm">
                <Gift className="pointer-events-none absolute -bottom-6 -right-6 h-40 w-40 text-emerald-500/10" />
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-600"><InfinityIcon className="h-4 w-4" />Free forever</span>
                <p className="mt-5 text-6xl font-black tracking-tighter">₹0</p>
                <p className="mt-2 font-semibold">Full access, AI built in — no card needed.</p>
                <p className="mt-2 text-sm text-muted-foreground">{o.free?.description || "Every product and every feature, free for life."}</p>
                <Link href="/signup" className="group relative mt-6 inline-flex items-center gap-2 text-sm font-black text-emerald-600">Start free <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              </div>
            </Reveal>
            {/* yearly */}
            <Reveal delay={120} className="lg:col-span-3">
              <div className="relative h-full overflow-hidden rounded-[2.25rem] border border-primary/25 bg-gradient-to-br from-primary/[0.08] to-brand-accent/[0.10] p-8">
                <PiggyBank className="pointer-events-none absolute -bottom-8 -right-6 h-44 w-44 text-primary/[0.08]" />
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary"><PiggyBank className="h-4 w-4" />Pay yearly</span>
                {topYearly?.yearly ? (
                  <>
                    <p className="mt-5 text-5xl font-black tracking-tight">Save {topYearly.yearly.vsMonthly}<span className="text-xl font-bold text-muted-foreground"> a year</span></p>
                    <p className="mt-2 text-muted-foreground">on {topYearly.name} — that is {topYearly.yearly.perMonth} a month when you pay for the year, instead of {topYearly.price}.</p>
                  </>
                ) : (
                  <p className="mt-5 text-2xl font-black">Pay for the year in one go.</p>
                )}
                <Link href="/pricing" className="group relative mt-6 inline-flex items-center gap-2 text-sm font-black text-primary">Switch to yearly on the pricing page <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              </div>
            </Reveal>
            {/* everything */}
            <Reveal delay={160} className="lg:col-span-3">
              <div className="relative h-full overflow-hidden rounded-[2.25rem] border border-border/60 bg-background p-8 shadow-sm">
                <Layers className="pointer-events-none absolute -bottom-8 -right-6 h-44 w-44 text-primary/[0.07]" />
                <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-black uppercase tracking-wider"><Sparkles className="h-4 w-4 text-primary" />Nothing locked</span>
                <p className="mt-5 text-5xl font-black tracking-tight">Every product · every feature</p>
                <p className="mt-2 text-muted-foreground">In every plan, including the free one. Plans differ only by team size and by storage, AI, email and voice allowances.</p>
                <Link href="/products" className="group relative mt-6 inline-flex items-center gap-2 text-sm font-black text-primary">See every feature <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* separate tools vs one platform */}
      {(() => {
        const st = o.allPlans.find((p) => p.id === "starter");
        const m = st?.offer.monthly ?? 0;
        return st && m > 0 ? (
          <section className="sr-section">
            <div className="sr-container">
              <SectionHead center icon="chart" eyebrow="Compare" title="One platform instead of" accent="a pile of subscriptions." lead="The same jobs on separate tools, with each price taken from the vendor's own pricing page." />
              <StackCompare plan={{ name: st.name, price: `₹${(m / 100).toLocaleString("en-IN")}`, monthly: m / 100 }} products={modules} />
            </div>
          </section>
        ) : null;
      })()}

      {/* plan by plan */}
      {o.plans.length > 0 && (
        <section className="sr-section bg-muted/10">
          <div className="sr-container">
            <SectionHead icon="chart" eyebrow="Plan by plan" title="What you pay," accent="and what you save." lead="The list price, the price you pay and the saving — for every paid plan." />
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {o.plans.map((p, i) => (
                <Reveal key={p.id} delay={(i % 3) * 80}>
                  <div className={`group relative flex h-full flex-col overflow-hidden rounded-[2rem] transition-all duration-500 hover:-translate-y-2 ${p.popular ? "sr-band shadow-2xl shadow-primary/40" : "border border-border/60 bg-background shadow-sm hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/15"}`}>
                    <div className={`flex items-center justify-between gap-3 px-6 py-3 text-xs font-black uppercase tracking-[0.14em] ${p.popular ? "bg-white text-[var(--primary)]" : "bg-gradient-to-r from-primary to-brand-accent text-white"}`}>
                      <span className="inline-flex items-center gap-2"><BadgePercent className="h-4 w-4" />{p.label}</span>
                      <span>Save {p.pct}%</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-5 p-7">
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-black tracking-tight">{p.name}</h3>
                        {p.popular && <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-white/85"><Star className="h-3.5 w-3.5 fill-current" />Most chosen</span>}
                      </div>
                      <div>
                        <p className="flex items-center gap-3"><span className={`text-xl font-semibold line-through ${p.popular ? "text-white/60" : "text-muted-foreground"}`}>{p.list}</span><span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-black text-white">−{p.pct}%</span></p>
                        <p className="mt-1 flex items-baseline gap-2"><span className="text-6xl font-black leading-none tracking-tighter">{p.price}</span><span className={`font-bold ${p.popular ? "text-white/75" : "text-muted-foreground"}`}>/ month</span></p>
                        <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold ${p.popular ? "bg-white/15" : "bg-emerald-500/15 text-emerald-600"}`}><Check className="h-3.5 w-3.5" strokeWidth={3} />You save {p.save} every month</p>
                      </div>
                      <ul className={`space-y-2.5 border-t pt-5 text-sm ${p.popular ? "border-white/20" : "border-border/60"}`}>
                        <li className="flex gap-2.5 font-semibold"><Check className="mt-0.5 h-4 w-4 flex-none" strokeWidth={3} />{p.seats}</li>
                        <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 flex-none" strokeWidth={3} />Every product and every feature</li>
                        {p.yearly && <li className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 flex-none" strokeWidth={3} />Or {p.yearly.price} a year — save {p.yearly.vsMonthly} more ({p.yearly.perMonth} a month)</li>}
                      </ul>
                      <div className="mt-auto grid gap-2 pt-2">
                        <Link href="/signup" className={`group/b inline-flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-black transition-all hover:scale-[1.03] ${p.popular ? "bg-white text-black shadow-xl" : "bg-foreground text-background shadow-lg"}`}>Get {p.name}<ArrowRight className="h-4 w-4 transition-transform group-hover/b:translate-x-1" /></Link>
                        <Link href={`/pricing/${p.id}`} className={`py-1 text-center text-sm font-bold ${p.popular ? "text-white" : "text-primary"}`}>View details →</Link>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* how */}
      <section className="sr-section">
        <div className="sr-container">
          <SectionHead icon="rocket" eyebrow={o.topPct > 0 ? "How to claim it" : "How to start"} title="Three steps," accent="no card needed." />
          <TimelineSteps cols={3} items={[
            { title: "Create your workspace", text: "Register free — every product and every feature, with no card needed.", icon: "rocket" },
            { title: "Set up your business", text: "Add your team, switch on the products you need and put your own brand on the workspace.", icon: "building" },
            { title: "Move to a plan when you grow", text: "When your team grows, choose a plan: the price you see on the plan is the price you pay.", icon: "wallet" },
          ]} />
          <div className="mt-14 flex justify-center"><HeroCtas primary={{ label: o.topPct > 0 ? "Start free — claim the offer" : "Start free", href: "/signup" }} secondary={{ label: "Talk to us", href: "/contact" }} /></div>
        </div>
      </section>

      {/* savings */}
      {o.allPlans.length > 0 && (
        <section className="sr-band sr-section">
          <div className="sr-container relative">
            <SectionHead tone="dark" icon="wallet" eyebrow="Cut your costs" title="What would you save?" accent="Do the maths." lead="Enter your own numbers — how many people, how many tools you pay for today and what they cost." />
            <Reveal><SavingsCalculator plans={o.allPlans} /></Reveal>
          </div>
        </section>
      )}

      <CtaBand title={o.topPct > 0 ? "Claim the offer. Start free." : "Start free."} lead="Free forever — with every product and every feature." />
      <FaqSection topics={["Plans & pricing", "Setup", "General"]} limit={6} />
    </>
  );
}
