import { breadcrumbList, planOffers, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { getOffers } from "@/lib/platform/saas/offers";
import { getStandardPlans } from "@/lib/platform/billing/plans";
import { buildShowcase } from "@/lib/platform/billing/showcase";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { EmptyState, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import PricingPlans from "@/components/platform/saas/PricingPlans";
import FaqSection from "@/components/platform/saas/FaqSection";
import StackCompare from "@/components/platform/saas/StackCompare";
import SavingsCalculator from "@/components/platform/saas/SavingsCalculator";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";
import { productPath } from "@/lib/platform/saas/product-routes";
import ProductLogo from "@/components/products/ProductLogo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/pricing", title: "Pricing: Free Forever, Pay as Your Team Grows", description: "Start free, no card needed. Every plan includes every product and every feature; plans differ only by team size and by storage, AI, email and voice allowances.", keywords: ["business software pricing", "free CRM and HR software", "free business software forever", "SaaS pricing plans", "affordable business software for small business", "free ERP alternative", "business software free plan", "pricing for all-in-one business platform", "pay as your team grows software"], tag: "Pricing" });

export default async function PricingPage() {
  const [allPlans, modules] = await Promise.all([Promise.all([getStandardPlans(), getBillingSettings().then((s) => s.billing.defaultTrialDays).catch(() => 30)]).then(([p, days]) => buildShowcase(p, days)).catch(() => []), getFeatureModules()]);
  const plans = allPlans.filter((p) => p.id !== "enterprise");
  const endsAt = (await getOffers().catch(() => null))?.endsAt ?? null;
  const has = plans.length > 0;
  const SEC = [
    { id: "plans", label: "Plans", show: true },
    { id: "how", label: "How pricing works", show: true },
    { id: "compare", label: "Compare plans", show: has },
    { id: "included", label: "In every plan", show: true },
    { id: "products", label: "All products", show: true },
    { id: "stack", label: "One platform", show: has },
    { id: "savings", label: "Savings", show: has },
    { id: "faq", label: "FAQs", show: true },
  ].filter((x) => x.show);
  const no = (id: string) => String(SEC.findIndex((x) => x.id === id) + 1).padStart(2, "0");
  const rows = plans[0]?.limits.map((l) => l.key) ?? [];
  return (
    <>
      <JsonLd data={[webPage({ type: "CollectionPage", path: "/pricing", name: "Pricing", description: "Start free, no card needed. Every plan includes every product and every feature; plans differ only by team size and by storage, AI, email and voice allowances." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }]), planOffers(plans.map((p) => ({ id: p.id, name: p.name, description: p.description, currency: p.currency, kind: p.kind, monthly: p.offer.monthly, validUntil: endsAt ? new Date(endsAt).toISOString() : null })))]} />
      <PageHero art="pricing" eyebrow="Pricing" title="Free forever." accent="Pay only as your team grows." lead={`Every plan includes every product, with every feature. A plan sets your team size and your storage, AI, email and voice allowance — nothing else. Prices exclude applicable taxes.`} photo="analytics" shot="fms" shotName="SelfRun CashFlow AI" chip={{ title: "Every feature, every plan", text: "Nothing locked behind a higher tier" }}>
        <HeroCtas primary={{ label: "Start free forever", href: "/signup" }} secondary={{ label: "Talk to us", href: "/contact" }} />
      </PageHero>

      <SectionScrollNav items={SEC} label="Pricing sections" numbered />

      <section id="plans" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n={no("plans")} icon="wallet" eyebrow="Plans" title="Pick the size of" accent="your team." lead="Every plan has every product and every feature. You are choosing how many people, and how much storage, AI, email and voice." />
          {plans.length ? <PricingPlans plans={plans} endsAt={endsAt} /> : <EmptyState title="Plans are being updated" body="Pricing isn't available right now. Contact us and we'll share the current plans."><Link href="/contact" className="sr-btn sr-btn-primary">Contact us</Link></EmptyState>}
        </div>
      </section>

      <section id="how" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n={no("how")} icon="check" eyebrow="How pricing works" title="Simple, with" accent="no hidden tiers." lead="Three rules explain the whole page." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: "layers" as const, t: "Everything is included", x: `Every product, with every feature, is in every plan, including the free one. Nothing is locked behind a higher tier.` },
              { icon: "users" as const, t: "Plans differ by team size", x: "A plan sets how many people can use the workspace. Start small and move up when your team grows." },
              { icon: "chart" as const, t: "And by allowances", x: "Storage, AI, email and voice usage are set per plan, so you only pay for the capacity you use." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}><div className="h-full rounded-3xl border border-border/60 bg-card p-7 shadow-sm"><span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-lg font-black text-white shadow-lg shadow-primary/30">{i + 1}</span><h3 className="text-xl font-black">{c.t}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{c.x}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      {plans.length > 0 && (
        <section id="compare" className="sr-section" style={{ scrollMarginTop: 140 }}>
          <div className="sr-container">
            <SectionHead n={no("compare")} center icon="chart" eyebrow="Compare plans" title="Every allowance," accent="side by side." lead="Open any plan for its full details." />
            <Reveal>
              <div className="overflow-x-auto rounded-3xl border border-border/60 bg-background shadow-sm">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-left">
                      <th className="p-4 font-bold text-muted-foreground">&nbsp;</th>
                      {plans.map((p) => <th key={p.id} className="p-4"><Link href={`/pricing/${p.id}`} className="font-black hover:text-primary">{p.name}</Link></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/40"><td className="p-4 font-semibold">People</td>{plans.map((p) => <td key={p.id} className="p-4">{p.seats ? `Up to ${p.seats.toLocaleString("en-IN")}` : "Unlimited"}</td>)}</tr>
                    <tr className="border-b border-border/40 bg-muted/20"><td className="p-4 font-semibold">Products and features</td>{plans.map((p) => <td key={p.id} className="p-4"><span className="inline-flex items-center gap-1.5 font-semibold text-primary"><Check className="h-4 w-4" />Every product</span></td>)}</tr>
                    <tr className="border-b border-border/40"><td className="p-4 font-semibold">Devices signed in at once</td>{plans.map((p) => <td key={p.id} className="p-4 font-medium">{p.kind === "free" ? "1 device" : "Unlimited"}</td>)}</tr>
                    {rows.map((k, i) => (
                      <tr key={k} className={`border-b border-border/40 ${i % 2 ? "" : "bg-muted/20"}`}>
                        <td className="p-4 font-semibold">{plans[0].limits.find((l) => l.key === k)?.label}</td>
                        {plans.map((p) => { const l = p.limits.find((x) => x.key === k); return <td key={p.id} className="p-4">{l?.included ? <span className="font-medium">{l.value}</span> : <Minus className="h-4 w-4 text-muted-foreground" />}</td>; })}
                      </tr>
                    ))}
                    <tr>
                      <td className="p-4 font-semibold">Details</td>
                      {plans.map((p) => <td key={p.id} className="p-4"><Link href={`/pricing/${p.id}`} className="inline-flex items-center gap-1 font-bold text-primary">View details <ArrowRight className="h-3.5 w-3.5" /></Link></td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      <section id="included" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n={no("included")} icon="bolt" eyebrow="In every plan" title="What you always" accent="get." lead="Beyond the products, these come with every plan, from free upwards." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "brain" as const, t: "AI and automation", x: "AI that works inside each person's permissions, and workflows that run on their own." },
              { icon: "target" as const, t: "Your own brand", x: "Your logo, colours, domain, emails and apps on everything your team and clients see." },
              { icon: "lock" as const, t: "Strict company isolation", x: "Your data is kept apart from every other company's, with roles and per-action permissions." },
              { icon: "file" as const, t: "An audit trail", x: "Sign-ins, changes and administrative actions are recorded, with who, what and when." },
              { icon: "rocket" as const, t: "Every device", x: "The same workspace in the browser, as an installable app and on your own phone and desktop apps." },
              { icon: "book" as const, t: "Guides for everything", x: "Step-by-step documentation and walkthroughs, with the real screen." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={(i % 3) * 60}><div className="flex h-full gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-sm"><span className="sr-icon h-12 w-12 flex-none"><Icon name={c.icon} className="h-5 w-5" /></span><span><span className="block font-black leading-snug">{c.t}</span><span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{c.x}</span></span></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="products" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n={no("products")} center icon="layers" eyebrow="Included in every plan" title="Every product," accent="from the free plan up." lead="You never pay extra to unlock a product. Open any to see what it does." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((m, i) => (
              <Reveal key={m.key} delay={(i % 4) * 50}>
                <Link href={productPath(m.key)} className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  <span className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-background shadow-sm transition-transform group-hover:scale-110"><ProductLogo productKey={m.key} size={34} title={m.name} /></span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-600"><Check className="h-3 w-3" strokeWidth={3.5} />Included</span>
                  </span>
                  <span className="font-black leading-tight transition-colors group-hover:text-primary">{m.name.replace(/^SelfRun\s+/i, "")}</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{m.description}</span>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-primary">See what it does <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {plans.length > 0 && (
        <section id="stack" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
          <div className="sr-container">
            <SectionHead n={no("stack")} center icon="chart" eyebrow="Compare" title="One platform instead of" accent="a pile of subscriptions." lead="The same jobs on separate tools, with each price taken from the vendor's own pricing page." />
            <StackCompare plan={(() => { const st = plans.find((p) => p.id === "starter"); return st ? { name: st.name, price: st.offer.monthly ? `₹${(st.offer.monthly / 100).toLocaleString("en-IN")}` : "", monthly: (st.offer.monthly ?? 0) / 100 } : null; })()} products={modules} />
          </div>
        </section>
      )}

      {plans.length > 0 && (
        <section id="savings" className="sr-band sr-section" style={{ scrollMarginTop: 140 }}>
          <div className="sr-container relative">
            <SectionHead n={no("savings")} tone="dark" center icon="wallet" eyebrow="Cut your costs" title="What would you save?" accent="Do the maths." lead="Enter your own numbers: how many people, how many tools you pay for today and what they cost." />
            <Reveal><SavingsCalculator plans={plans} /></Reveal>
          </div>
        </section>
      )}

      <FaqSection n={no("faq")} topics={["Plans & pricing", "General"]} limit={6} lead="The questions people ask most about plans and pricing. More answers are on the FAQs page." />
    </>
  );
}
