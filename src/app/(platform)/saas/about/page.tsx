import { breadcrumbList, organizationPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { INDUSTRIES, SECURITY_POINTS, USE_CASES, USE_CASE_PLAIN_TITLES } from "@/lib/platform/saas/content";
import { GROWTH } from "@/lib/platform/saas/site";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { CtaBand, HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import { panelColor } from "@/lib/platform/saas/palette";
import ProductLogo from "@/components/products/ProductLogo";
import { productPath } from "@/lib/platform/saas/product-routes";
import Icon from "@/components/platform/saas/Icon";
import { NumberedRows } from "@/components/platform/saas/Modern";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Reveal from "@/components/platform/saas/Reveal";
import MarketingShot from "@/components/platform/saas/MarketingShot";
import AboutHeroArtwork from "@/components/platform/saas/AboutHeroArtwork";
import CustomerStoriesSection from "@/components/platform/saas/CustomerStoriesSection";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/about", title: "About SelfRun AI: What We Build and Why", description: "SelfRun AI is one software for running your whole business. Learn what we build, who it is for, how a business grows on it and the values behind it.", keywords: ["about SelfRun AI", "business automation company", "AI software company India", "who makes SelfRun AI", "business software mission", "SaaS company values", "all-in-one business platform company"], tag: "About" });

const VALUES = [
  { title: "Built for every business", body: "We design for the many businesses that use SelfRun AI, never for one special case. If one customer needs something, it becomes a feature that everyone can use.", icon: "building" as const },
  { title: "Automation you can trust", body: "Automation is only useful if you can trust it. Every automatic action is recorded, explained and under your control, and people stay in the loop wherever a decision matters.", icon: "workflow" as const },
  { title: "Your data stays yours", body: "Every business's data is kept strictly apart from every other business's. You decide who can do what, secrets are stored encrypted, and you can export your data at any time.", icon: "lock" as const },
  { title: "Easy to start", body: "Powerful software should still be easy to begin with. A guided setup, sensible defaults and one consistent look across every product.", icon: "bolt" as const },
  { title: "Your brand, not ours", body: "Every business uses SelfRun AI under its own name, with its own logo, colours, web address, emails and apps. SelfRun stays out of sight.", icon: "target" as const },
  { title: "Honest by default", body: "We describe the product as it is. Where there is no customer story to share yet, we say so instead of inventing one.", icon: "check" as const },
];

const PRINCIPLES = [
  { title: "Take the repetitive work off people", body: "Copying details from one app to another, chasing approvals and building reports should be the software's job, so people can spend their time on customers and growth." },
  { title: "Start small, add what you need", body: "Each product works on its own. Choose the ones that fit your business today and add more when you are ready." },
  { title: "Automation people can trust", body: "Every run is recorded and explained, automations can be paused at any time, and approvals keep people in control of anything that moves money." },
  { title: "AI that asks permission", body: "AI answers from your real records, shows how it got there, and only sees what the person asking is allowed to see." },
];

const NAV = [
  { id: "about", label: "About us" },
  { id: "mission", label: "Why we exist" },
  { id: "what-we-do", label: "What we do" },
  { id: "numbers", label: "At a glance" },
  { id: "who", label: "Who uses it" },
  { id: "growth", label: "Your first year" },
  { id: "stories", label: "Everyday examples" },
  { id: "values", label: "Our values" },
  { id: "commitments", label: "Safety and control" },
  { id: "connect", label: "Get in touch" },
];

function Head({ id, title, accent, lead, dark = false }: { id: string; title: string; accent?: string; lead?: string; dark?: boolean }) {
  const n = String(NAV.findIndex((x) => x.id === id) + 1).padStart(2, "0");
  return (
    <Reveal className="mx-auto mb-12 max-w-3xl text-center">
      <p className={`mb-4 flex flex-col items-center gap-3 text-xs font-black uppercase tracking-[0.2em] ${dark ? "text-white/80" : "text-primary"}`}><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-lg tracking-normal text-white shadow-lg shadow-primary/30">{n}</span>{NAV.find((x) => x.id === id)?.label}</p>
      <h2 className="text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">{title}{accent && <> <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">{accent}</span></>}</h2>
      {lead && <p className={`mt-4 text-lg leading-relaxed ${dark ? "text-white/75" : "text-muted-foreground"}`}>{lead}</p>}
    </Reveal>
  );
}

export default async function AboutPage() {
  const groups = await getFeatureGroups();
  const modules = groups.flatMap((g) => g.items);
  const orbitPanels = modules.map((module) => ({ ...module, color: panelColor(module.key) }));
  return (
    <>
      <JsonLd data={[organizationPage({ type: "AboutPage", path: "/about", name: "About us", description: "SelfRun AI is one software for running your whole business. Learn what we build, who it is for, how a business grows on it and the values behind it." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "About us", path: "/about" }])]} />
      <PageHero artContent={<AboutHeroArtwork panels={orbitPanels} brand={SAAS_BRAND.name} />}
        eyebrow="About SelfRun AI"
        title="We believe a business"
        accent="should run itself."
        lead="Too many businesses spend their best hours copying details from one app to another, chasing approvals and building reports by hand. SelfRun AI exists to take that work off people's plates. It is one software, with a product for each job, that handles the routine so your team can focus on customers and growth."
      >
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Contact us", href: "/contact" }} />
      </PageHero>

      <SectionScrollNav items={NAV} label="On this page" numbered />

      {/* About us */}
      <section id="about" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="about" title="One software for" accent="the whole business." lead="Here is who we are and what we build, in plain terms." />
          <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <div className="space-y-4 leading-relaxed text-muted-foreground">
              <p className="text-lg font-medium leading-relaxed text-foreground">{SAAS_BRAND.name} brings the everyday work of a business into one software: customers and sales, staff and payroll, accounts and invoices, projects, purchasing, training, documents, a website builder, team chat and more. Each job has its own product, and each product can work on its own.</p>
              <p>Use the products you need, one at a time or all together. The AI works with the records in each product, and whenever you choose to connect products you can set up automatic steps between them, such as creating a client record when a deal is won.</p>
              <p>SelfRun AI is built for many businesses at once. Every business gets the same features, the same guided setup and the same safeguards, and there is no special version for anyone. Each business uses it under its own name: in a web browser, as an installable app, on Android and iPhone, and on a computer.</p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {([
                { icon: "layers" as const, v: "All", l: "ready-made products" },
                { icon: "wallet" as const, v: "Free", l: "to start, every feature included" },
                { icon: "target" as const, v: "Yours", l: "your own name, logo and web address" },
              ]).map((x, i) => (
                <Reveal key={x.v} delay={i * 70}>
                  <div className="group h-full rounded-2xl border border-border/60 bg-card p-4 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                    <span className="sr-icon mx-auto mb-2 h-10 w-10 rounded-xl"><Icon name={x.icon} className="h-4 w-4" /></span>
                    <p className="bg-gradient-to-br from-primary to-brand-accent bg-clip-text text-3xl font-black leading-none tracking-tight text-transparent">{x.v}</p>
                    <p className="mt-1.5 text-xs font-medium leading-snug text-muted-foreground">{x.l}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
          <Reveal><MarketingShot screenKey="workspace" name="SelfRun CommandOS" /></Reveal>
        </div>
        </div>
      </section>

      {/* Mission */}
      <section id="mission" className="sr-section relative overflow-hidden bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="mission" title="Give every business software" accent="that runs the routine." lead="From a ten-person team to a large organisation: one intelligent system that handles the repetitive parts of running a business, so people can focus on what only people can do: looking after customers, doing good work and growing." />
          <NumberedRows items={PRINCIPLES.map((p) => ({ title: p.title, text: p.body }))} />
        </div>
      </section>

      {/* What we do */}
      <section id="what-we-do" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="what-we-do" title="Every area of your business," accent="one software." lead="We build and run the software your business works in. Each area below is a group of products, and all of them are included in every plan." />
          <div className="mb-20">
            <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {groups.map((g, i) => (
                <Reveal key={g.id} as="li" delay={(i % 3) * 60}>
                  <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                    <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
                    <div className="mb-4 flex items-center gap-4">
                      <span className="sr-icon h-14 w-14 flex-none rounded-2xl transition-transform group-hover:scale-110"><Icon name={g.icon} className="h-6 w-6" /></span>
                      <h3 className="text-lg font-black leading-snug">{g.title}</h3>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{g.lead}</p>
                    <ul className="mt-5 space-y-2">
                      {g.items.map((m) => (
                        <li key={m.key}>
                          <Link href={productPath(m.key)} className="flex items-center gap-3 rounded-xl border border-border/50 bg-background px-3 py-2 text-sm font-bold transition-all hover:border-primary/40 hover:text-primary hover:shadow-sm">
                            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-border/60 bg-card"><ProductLogo productKey={m.key} size={22} title={m.name} /></span>
                            <span className="min-w-0 flex-1 truncate">{m.name}</span>
                            <ArrowRight className="h-3.5 w-3.5 flex-none opacity-0 transition-opacity group-hover:opacity-60" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-5">
                      <Link href={`/products#${g.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">See this area <ArrowRight className="h-4 w-4" /></Link>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* What we have built */}
      <section id="numbers" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="numbers" title="What we have built," accent="at a glance." lead="Counted from the live product, not rounded up for effect." />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { v: "All", l: "ready-made products", x: "Each one covers a job in your business, from sales to payroll." },
              { v: "AI", l: "built into the software", x: "Ask questions and get drafts and answers from your own records." },
              { v: "Every", l: "area of your business", x: "From sales and people to finance and your website." },
              { v: "Step by step", l: "guides and walkthroughs", x: "Each one uses the real screen." },
            ].map((n, i) => (
              <Reveal key={n.l} delay={i * 60}>
                <div className="h-full rounded-3xl border border-border/60 bg-gradient-to-br from-primary/[0.07] via-card to-brand-accent/[0.07] p-7 text-center shadow-sm">
                  <p className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-6xl font-black leading-none tracking-tighter text-transparent">{n.v}</p>
                  <p className="mt-3 text-lg font-black">{n.l}</p>
                  <p className="mt-1 text-sm leading-snug text-muted-foreground">{n.x}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Who it is for */}
      <section id="who" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="who" title="Built for the way" accent="you work." lead="The same software serves very different businesses. Here are the kinds of business it fits, and what each of them gets from it." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map((x, i) => (
              <Reveal key={x.slug} delay={(i % 3) * 70}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-sm font-black text-white shadow-md shadow-primary/25">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-xl font-black leading-snug">{x.name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{x.summary}</p>
                  <ul className="mt-4 space-y-2">{x.needs.map((n) => <li key={n} className="flex gap-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 flex-none text-primary" strokeWidth={3} />{n}</li>)}</ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Growth */}
      <section id="growth" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="growth" title="From day one to a business" accent="that runs itself." lead="A suggested path, not a rule: launch in a day, get organised in a week, automate in a month, then see, grow and scale. Switch on a few products at each step." />
          <ol className="relative mx-auto max-w-5xl space-y-12 lg:space-y-0">
            <span className="absolute bottom-0 left-[27px] top-0 w-px bg-gradient-to-b from-primary/60 via-primary/25 to-transparent lg:left-1/2" aria-hidden />
            {GROWTH.map((p, i) => (
              <Reveal key={p.id} as="li" delay={80} className={`relative pl-[72px] lg:w-1/2 lg:pb-14 lg:pl-0 ${i % 2 ? "lg:ml-auto lg:pl-14" : "lg:pr-14 lg:text-right"}`}>
                <span className={`sr-circle absolute left-0 top-0 h-[54px] w-[54px] text-base font-black shadow-xl shadow-primary/30 ring-[6px] ring-background ${i % 2 ? "lg:-left-[27px]" : "lg:left-auto lg:-right-[27px]"}`}>{i + 1}</span>
                <span className="inline-block rounded-full bg-gradient-to-r from-primary to-brand-accent px-3.5 py-1 text-xs font-black uppercase tracking-widest text-white">{p.when}</span>
                <h3 className="mt-3 text-2xl font-black leading-snug tracking-tight">{p.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{p.goal}</p>
                <ul className={`mt-4 space-y-2 ${i % 2 ? "" : "lg:inline-block lg:text-left"}`}>{p.actions.slice(0, 3).map((a) => <li key={a} className="flex gap-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 flex-none text-primary" strokeWidth={3} />{a}</li>)}</ul>
                <p className="mt-4 border-l-4 border-primary pl-4 text-left font-semibold leading-snug"><span className="text-primary">After · </span>{p.after}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Stories */}
      <section id="stories" className="sr-band sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container relative space-y-16">
          <CustomerStoriesSection tone="dark" />
          <Head id="stories" title="Examples built around" accent="how work gets done." lead="These examples are based on what the software can really do. They show how your teams and records connect, and they do not use invented customers or results." dark />
          <div className="grid gap-5 lg:grid-cols-2">
            {USE_CASES.map((u, i) => (
              <Reveal key={u.slug} delay={(i % 2) * 80}>
                <article className="sr-glass h-full space-y-5 p-8">
                  <div><p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary">Example workflow</p><h3 className="text-2xl font-black">{USE_CASE_PLAIN_TITLES[u.slug] ?? u.title}</h3><p className="mt-1 text-sm text-muted-foreground">{u.summary}</p><p className="mt-4 text-sm leading-relaxed text-white/80">{u.narrative}</p></div>
                  <div><p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">The problem</p><p className="text-sm leading-relaxed">{u.problem}</p></div>
                  <div><p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">How it runs</p><ol className="space-y-2">{u.solution.map((s, n) => <li key={s} className="flex gap-3 text-sm"><span className="sr-circle mt-0.5 h-5 w-5 flex-none text-[10px] font-black">{n + 1}</span>{s}</li>)}</ol></div>
                </article>
              </Reveal>
            ))}
          </div>
          <div className="text-center"><Link href="/success-stories" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">See more examples and workflows <ArrowRight className="h-4 w-4" /></Link></div>
        </div>
      </section>

      {/* Values */}
      <section id="values" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="values" title="What we hold" accent="ourselves to." lead="Six values that decide how we build and how we talk about the product." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} delay={(i % 3) * 60}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-4 h-12 w-12 transition-transform group-hover:scale-110"><Icon name={v.icon} className="h-5 w-5" /></span>
                  <h3 className="text-lg font-black leading-snug">{v.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{v.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Commitments */}
      <section id="commitments" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="commitments" title="Safety and control" accent="built in." lead="What protects your business's data and keeps you in charge of it." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SECURITY_POINTS.map((x, i) => (
              <Reveal key={x.title} delay={(i % 3) * 60}>
                <div className="flex h-full gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-sm"><span className="sr-icon h-12 w-12 flex-none"><Icon name={x.icon} className="h-5 w-5" /></span><span><span className="block font-black leading-snug">{x.title}</span><span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{x.body}</span></span></div>
              </Reveal>
            ))}
          </div>
          <p className="mt-10 text-center text-sm text-muted-foreground">Read <Link href="/security" className="font-bold text-primary">security &amp; trust</Link>, the <Link href="/data-policy" className="font-bold text-primary">data policy</Link> and the <Link href="/sla" className="font-bold text-primary">service level</Link>.</p>
        </div>
      </section>

      {/* Get in touch */}
      <section id="connect" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="connect" title="Let's talk about" accent="your business." lead="Start free on your own, see the software with your own examples, or ask us anything first." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: "rocket" as const, t: "Start free", x: "Register with your work email and switch on the products you need. No card needed.", href: "/signup", c: "Get started free" },
              { icon: "target" as const, t: "See it with your examples", x: "Bring one process you want to improve and we will show how the software handles it.", href: "/demo", c: "Request a demo" },
              { icon: "chat" as const, t: "Ask us anything", x: "Questions about plans, fit or safety? Send a message and we reply within one business day.", href: "/contact", c: "Contact us" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}>
                <Link href={c.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-5 h-14 w-14 transition-transform group-hover:scale-110"><Icon name={c.icon} className="h-6 w-6" /></span>
                  <h3 className="text-xl font-black">{c.t}</h3>
                  <p className="mt-2 flex-1 leading-relaxed text-muted-foreground">{c.x}</p>
                  <span className="mt-5 inline-flex items-center gap-2 font-bold text-primary">{c.c}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Talk to the team, or just start." lead="We would love to hear how your business runs today and where it loses time." />
      <FaqSection topics={["General", "Data & security", "Your brand"]} limit={6} />
    </>
  );
}
