import { breadcrumbList, itemList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { CtaBand, HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import FaqSection from "@/components/platform/saas/FaqSection";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import StoryExplorer from "@/components/platform/saas/StoryExplorer";
import CustomerStoriesSection from "@/components/platform/saas/CustomerStoriesSection";
import ProductLogo from "@/components/products/ProductLogo";
import type { IconKey } from "@/lib/platform/saas/content";
import { INDUSTRIES, USE_CASES, USE_CASE_PLAIN_TITLES } from "@/lib/platform/saas/content";
import { TUTORIALS } from "@/lib/platform/saas/tutorials";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { productPath } from "@/lib/platform/saas/product-routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/success-stories", title: "Real-Life Examples: How a Business Runs on SelfRun AI", description: "See how everyday work runs on SelfRun AI, from first enquiry to payment, hiring to payroll, buying to paying suppliers. Customer stories appear when a business approves them.", keywords: ["business automation use cases", "lead to cash workflow", "hire to retire process", "procure to pay workflow", "customer success stories software", "business workflow examples", "SaaS case studies", "automation examples for small business"], tag: "Stories" });

const NAV = [
  { id: "read", label: "How to read them" },
  { id: "customers", label: "Customer stories" },
  { id: "library", label: "Worked examples" },
  { id: "areas", label: "By area of work" },
  { id: "industries", label: "By kind of business" },
  { id: "products", label: "Products used" },
  { id: "common", label: "What they share" },
  { id: "learn", label: "Try it yourself" },
  { id: "standards", label: "How we write them" },
  { id: "share", label: "Share yours" },
];

function Head({ id, title, accent, lead }: { id: string; title: string; accent?: string; lead?: string }) {
  const n = String(NAV.findIndex((x) => x.id === id) + 1).padStart(2, "0");
  return (
    <Reveal className="mx-auto mb-12 max-w-3xl text-center">
      <p className="mb-4 flex flex-col items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-primary"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-lg tracking-normal text-white shadow-lg shadow-primary/30">{n}</span>{NAV.find((x) => x.id === id)?.label}</p>
      <h2 className="text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">{title}{accent && <> <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">{accent}</span></>}</h2>
      {lead && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lead}</p>}
    </Reveal>
  );
}

/** An icon for each kind of business. */
const INDUSTRY_ICON: Record<string, IconKey> = { "it-and-software": "bolt", "education-and-training": "graduation", "agencies-and-consultancies": "megaphone", "trading-and-distribution": "cart", "professional-services": "file", "growing-smes": "rocket" };

export default async function SuccessStoriesPage() {
  const modules = await getFeatureModules();
  const byKey = new Map(modules.map((m) => [m.key, m]));
  const stories = USE_CASES.map((u) => ({
    slug: u.slug, title: USE_CASE_PLAIN_TITLES[u.slug] ?? u.title, summary: u.summary, narrative: u.narrative, problem: u.problem, solution: u.solution, result: u.result,
    products: u.modules.flatMap((k) => { const m = byKey.get(k); return m ? [{ key: k, name: m.name, href: productPath(k) }] : []; }),
  }));
  const groups = await getFeatureGroups();
  const byArea = groups.map((g) => ({ g, list: USE_CASES.filter((u) => u.modules.some((k) => g.items.some((m) => m.key === k))) })).filter((x) => x.list.length);
  const byIndustry = INDUSTRIES.map((x) => ({ x, list: USE_CASES.filter((u) => u.modules.some((k) => x.modules.includes(k))) })).filter((y) => y.list.length);
  const usage = modules.map((m) => ({ m, list: USE_CASES.filter((u) => u.modules.includes(m.key)) })).filter((x) => x.list.length > 0).sort((a, b) => b.list.length - a.list.length);

  return (
    <>
      <JsonLd data={[webPage({ type: "CollectionPage", path: "/success-stories", name: "Customer stories and examples", description: "See how everyday work runs on SelfRun AI, from first enquiry to payment, hiring to payroll, buying to paying suppliers. Customer stories appear when a business approves them." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Success stories", path: "/success-stories" }]), itemList({ name: "SelfRun AI worked examples", items: USE_CASES.map((u) => ({ name: USE_CASE_PLAIN_TITLES[u.slug] ?? u.title, path: "/success-stories#library" })) })]} />
      <PageHero
        art="features"
        eyebrow="Customer stories & examples"
        title="See how work flows"
        accent="across your business."
        lead="Here is how a business can run on SelfRun AI, one job at a time, from the first enquiry to money in the bank. Customer stories appear here when a business approves them. Until then you will find worked examples, based only on what the product really does."
        photo="colleagues"
        shot="workspace"
        shotName="SelfRun CommandOS"
        chip={{ title: "Worked examples", text: "Based on what the product does today" }}
      >
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Talk with our team", href: "/contact" }} />
      </PageHero>

      <SectionScrollNav items={NAV} label="Story sections" numbered />

      {/* 01 read */}
      <section id="read" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="read" title="Two kinds of story," accent="clearly labelled." lead="You should always know what you are reading. Here is the difference between the two." />
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
                <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-1.5 text-sm font-black text-emerald-600"><BadgeCheck className="h-4 w-4" />Customer story</span>
                <h3 className="text-xl font-black">A real business, in its own words</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">Published only after the business has approved every detail it shares. Any result is reported by the customer, not estimated by us.</p>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="h-full rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
                <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-sm font-black text-primary"><FileText className="h-4 w-4" />Worked example</span>
                <h3 className="text-xl font-black">A job, shown step by step</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">An illustration built from what the product really does. It shows how work connects. It is not the account of a named customer, and it does not claim any results.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 02 customers */}
      <section id="customers" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="customers" title="Stories from" accent="our customers." lead="Customer stories that businesses have approved appear here." />
          <CustomerStoriesSection />
        </div>
      </section>

      {/* 03 library */}
      <section id="library" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="library" title="See how the work" accent="connects." lead="Pick an example to read the problem, the steps and the products involved." />
          <StoryExplorer stories={stories} />
        </div>
      </section>

      {/* areas */}
      <section id="areas" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="areas" title="Find a story by" accent="area of your business." lead="Each area of your business lists the examples that touch it." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {byArea.map(({ g, list }, i) => (
              <Reveal key={g.id} delay={(i % 3) * 60}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3"><span className="sr-icon h-11 w-11 flex-none"><Icon name={g.icon} className="h-5 w-5" /></span><div><h3 className="font-black leading-tight">{g.title}</h3><p className="text-xs font-bold text-muted-foreground">Worked examples</p></div></div>
                  <ul className="space-y-2">{list.map((u) => <li key={u.slug}><a href="#library" data-story={u.slug} className="group flex items-start gap-2 text-[15px] font-semibold leading-snug hover:text-primary"><ArrowRight className="mt-1 h-3.5 w-3.5 flex-none text-primary" />{USE_CASE_PLAIN_TITLES[u.slug] ?? u.title}</a></li>)}</ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* industries */}
      <section id="industries" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="industries" title="Find an example for" accent="your kind of business." lead="The kinds of business SelfRun AI fits, and the examples most relevant to each." />
          <div className="grid gap-5 md:grid-cols-2">
            {byIndustry.map(({ x, list }, i) => (
              <Reveal key={x.slug} delay={(i % 2) * 60}>
                <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
                  <div className="mb-3 flex items-center gap-4">
                    <span className="sr-icon h-14 w-14 flex-none rounded-2xl transition-transform group-hover:scale-110"><Icon name={INDUSTRY_ICON[x.slug] ?? "building"} className="h-6 w-6" /></span>
                    <h3 className="text-xl font-black leading-snug">{x.name}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{x.summary}</p>
                  <p className="mb-2.5 mt-5 text-[11px] font-black uppercase tracking-[0.16em] text-primary">Examples that fit</p>
                  <div className="flex flex-wrap gap-2">
                    {list.slice(0, 5).map((u) => (
                      <a key={u.slug} href="#library" data-story={u.slug} className="group/chip inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-bold transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary hover:shadow-sm">{USE_CASE_PLAIN_TITLES[u.slug] ?? u.title}<ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover/chip:opacity-100" /></a>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 04 products */}
      <section id="products" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="products" title="The products" accent="behind the examples." lead="Which products appear in the most examples, so you can see where connected work usually starts." />
          <ul className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {usage.map(({ m, list }, i) => (
              <Reveal key={m.key} as="li" delay={(i % 3) * 50}>
                <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  <Link href={productPath(m.key)} className="flex items-center gap-3.5">
                    <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm transition-transform group-hover:scale-105"><ProductLogo productKey={m.key} size={40} title={m.name} /></span>
                    <span className="min-w-0 font-black leading-tight transition-colors hover:text-primary">{m.name}</span>
                  </Link>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{m.description}</p>
                  <p className="mb-2 mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-primary">Used in</p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.slice(0, 3).map((u) => <a key={u.slug} href="#library" data-story={u.slug} className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-bold transition-colors hover:border-primary/40 hover:text-primary">{USE_CASE_PLAIN_TITLES[u.slug] ?? u.title}</a>)}
                    {list.length > 3 && <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">and more</span>}
                  </div>
                  <div className="mt-auto pt-4">
                    <Link href={productPath(m.key)} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">See the product <ArrowRight className="h-4 w-4" /></Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* common */}
      <section id="common" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="common" title="What every example" accent="has in common." lead="Different businesses, the same few things going right." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "workflow" as const, t: "Nothing is typed twice", x: "Details entered in one step carry into the next, instead of being copied by hand." },
              { icon: "users" as const, t: "Someone owns each step", x: "Every task has an owner, an approval where it matters, and a record of who did what." },
              { icon: "clock" as const, t: "Routine runs on its own", x: "Reminders and hand-offs happen without anyone chasing, and every run is recorded." },
              { icon: "chart" as const, t: "Answers from live records", x: "Leaders read the current picture from the records themselves, not from a report stitched together by hand." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 60}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-4 h-12 w-12 transition-transform group-hover:scale-110"><Icon name={c.icon} className="h-5 w-5" /></span>
                  <h3 className="text-lg font-black leading-snug">{c.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{c.x}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* learn */}
      <section id="learn" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="learn" title="Try it yourself," accent="step by step." lead="Follow a walkthrough in the product, with the real screen beside each step." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {TUTORIALS.map((t, i) => (
              <Reveal key={t.slug} delay={(i % 3) * 60}>
                <Link href={`/docs/walkthroughs/${t.slug}`} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider"><span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">Walkthrough</span><span className="text-muted-foreground">{t.minutes} min · {t.level}</span></div>
                  <h3 className="text-lg font-black leading-snug group-hover:text-primary">{t.title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted-foreground">{t.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">Start the walkthrough<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-center text-sm"><Link href="/docs#walkthroughs" className="font-bold text-primary hover:underline">See all walkthroughs and guides</Link></p>
        </div>
      </section>

      {/* 05 standards */}
      <section id="standards" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="standards" title="How we write" accent="every story." lead="The rules we follow, so you can trust what you read." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "check" as const, t: "Based on the product", x: "Every step describes something the product really does today." },
              { icon: "shield" as const, t: "No invented names", x: "We never make up a customer, a quote or a result to make an example sound better." },
              { icon: "file" as const, t: "Approval before publishing", x: "A customer story goes live only after the business has approved what it says." },
              { icon: "chart" as const, t: "Results belong to the customer", x: "Any result is reported by the customer and labelled that way." },
              { icon: "bolt" as const, t: "Clearly labelled", x: "Worked examples say they are illustrations, so nobody mistakes them for a customer's account." },
              { icon: "target" as const, t: "Honest when there is nothing yet", x: "If we have no approved story to show, we say so instead of filling the space." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={(i % 3) * 60}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-4 h-12 w-12 transition-transform group-hover:scale-110"><Icon name={c.icon} className="h-5 w-5" /></span>
                  <h3 className="text-lg font-black leading-snug">{c.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{c.x}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 06 share */}
      <section id="share" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="share" title="Using SelfRun?" accent="Share your story." lead="If the platform has helped your business, we would be glad to tell it, in your words and only with your approval." />
          <Reveal>
            <div className="relative mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-brand-accent text-white shadow-2xl shadow-primary/25 lg:grid-cols-[1.1fr_1fr]">
              <Sparkles className="absolute -right-4 -top-4 h-40 w-40 text-white/10" aria-hidden />
              <div className="relative p-8 sm:p-10">
                <h3 className="text-2xl font-black leading-snug sm:text-3xl">Tell us how it works for you</h3>
                <p className="mt-3 leading-relaxed text-white/85">Send us a message. We will talk through what you would like to share and write it with you. Nothing is published until you approve the final text.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-primary shadow-lg transition-transform hover:-translate-y-0.5">Share your experience <ArrowRight className="h-4 w-4" /></Link>
                  <Link href="/signup" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">Get started free</Link>
                </div>
              </div>
              <div className="relative border-t border-white/20 bg-white/10 p-8 sm:p-10 lg:border-l lg:border-t-0">
                <p className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/80"><ShieldCheck className="h-4 w-4" />You stay in control</p>
                <ul className="space-y-3">
                  {["You approve every word before it goes live", "You decide what is shared and what is not", "Results are yours, in your numbers", "You can ask us to remove it later"].map((x) => <li key={x} className="flex gap-3 font-semibold"><Check className="mt-0.5 h-5 w-5 flex-none" strokeWidth={3} />{x}</li>)}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand title="Write your own story, start free." lead="Every feature is included in every plan. Start free, no card needed." />
      <FaqSection
        topics={["General"]}
        limit={3}
        title="Questions about"
        accent="the stories."
        lead="What these stories and examples are, and what they are not."
        extra={[
          { q: "Are these real customers?", a: "Customer stories are real and appear only with the business's approval. Worked examples are illustrations built from what the product really does, and they are labelled that way." },
          { q: "Why don't you show customer numbers and quotes?", a: "We only publish results that a customer has reported and approved. If there is no approved story to show, we say so instead of inventing one." },
          { q: "Can my business be featured?", a: "Yes. Contact us, tell us what you would like to share, and we will write it with you. Nothing is published until you approve it." },
        ]}
      />
    </>
  );
}
