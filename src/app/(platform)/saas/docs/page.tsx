import { breadcrumbList, itemList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Clock } from "lucide-react";
import { NumberedRows } from "@/components/platform/saas/Modern";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { featuresOf } from "@/lib/platform/saas/feature-lists";
import { DOCS, DOC_CATEGORIES } from "@/lib/platform/saas/docs";
import { TUTORIALS } from "@/lib/platform/saas/tutorials";
import { CtaBand, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import DocsSearch, { type DocEntry } from "@/components/platform/saas/DocsSearch";
import ProductLogo from "@/components/products/ProductLogo";
import { productDocsPath, productPath } from "@/lib/platform/saas/product-routes";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/docs", title: "Documentation: Guides and Walkthroughs", description: "Step-by-step guides and walkthroughs for every feature of SelfRun AI, with the real screen beside each step. Set up your business workspace and learn each product.", keywords: ["business software documentation", "CRM user guide", "HR software setup guide", "payroll software how to", "project management software tutorial", "accounting software guide", "SaaS help center", "how to set up business software", "step by step software guides"], tag: "Docs" });

const NAV = [
  { id: "start", label: "Start here" },
  { id: "path", label: "Learning path" },
  { id: "walkthroughs", label: "Walkthroughs" },
  { id: "guides", label: "General guides" },
  { id: "products", label: "Guides by product" },
  { id: "help", label: "Need help" },
  { id: "faq", label: "FAQs" },
];

/** The order we suggest to a new business: each entry is a real guide in the library. */
const PATH: { slug: string; title: string; text: string }[] = [
  { slug: "getting-started", title: "Set up your business workspace", text: "Create your account, finish the guided setup and see how the workspace is laid out." },
  { slug: "brand-your-workspace", title: "Add your logo, name and colours", text: "Make every screen, email and PDF carry your business identity." },
  { slug: "invite-your-team", title: "Invite your team and set access", text: "Give each person the right role, so they see only what their job needs." },
  { slug: "import-your-data", title: "Bring in your existing records", text: "Import leads, clients and employees from a spreadsheet (CSV), with a check on every row." },
  { slug: "first-automations", title: "Switch on your first automations", text: "Let routine work run by itself: new-lead alerts, paid-invoice emails and leave approvals." },
  { slug: "your-own-apps", title: "Put it on every device", text: "Install the web app and generate your own Android, iPhone and desktop apps." },
];

export default async function DocsPage() {
  const groups = await getFeatureGroups();
  const panels = groups.flatMap((g) => g.items);
  const entries: DocEntry[] = panels.flatMap((m) => featuresOf(m.key).map((f) => ({ panelKey: m.key, panel: m.name, slug: f.slug, name: f.name, text: f.text })));
  const explorer = panels.flatMap((m) => {
    const fs = featuresOf(m.key);
    if (!fs.length) return [];
    return [{ key: m.key, name: m.name, summary: m.summary, groups: [...new Set(fs.map((f) => f.group))].map((g) => ({ name: g, items: fs.filter((f) => f.group === g).map((f) => ({ slug: f.slug, name: f.name, text: f.text })) })) }];
  });
  const cats = DOC_CATEGORIES.map((c) => ({ ...c, list: DOCS.filter((d) => d.category === c.name) })).filter((c) => c.list.length);

  return (
    <>
      <JsonLd data={[webPage({ type: "CollectionPage", path: "/docs", name: "Documentation", description: "Step-by-step guides and walkthroughs for every feature of SelfRun AI, with the real screen beside each step. Set up your business workspace and learn each product." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Documentation", path: "/docs" }]), itemList({ name: "SelfRun AI guides by product", items: panels.map((m) => ({ name: `${m.name} guides`, path: `/docs#${m.key}` })) }), itemList({ name: "SelfRun AI walkthroughs", items: TUTORIALS.map((t) => ({ name: t.title, path: `/docs/walkthroughs/${t.slug}` })) })]} />
      <PageHero art="docs" eyebrow="A guide for every feature · general guides · walkthroughs" title="Learn SelfRun AI" accent="one step at a time." lead="Everything you need to set up SelfRun AI and use it every day, from creating your account to running payroll or publishing your website. Every guide shows the real screen and the exact steps to follow. New here? Follow the learning path below, or search for the job you want to do." photo="laptop-talk" shot="support" shotName="SelfRun ResolveIQ">
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Browse walkthroughs", href: "#walkthroughs" }} />
      </PageHero>

      <SectionScrollNav items={NAV} label="Documentation products" numbered />

      {/* 01 start */}
      <section id="start" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="01" icon="search" eyebrow="Start here" title="What do you want" accent="to do?" lead="Search the guides by what you want to do, or choose the way you prefer to learn." />
          <Reveal className="mb-12"><DocsSearch entries={entries} large /></Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: "rocket" as const, t: "Set up your workspace", x: "From a new account to a working business workspace, step by step.", href: "/docs/getting-started", c: "Open the setup guide" },
              { icon: "book" as const, t: "Follow a walkthrough", x: "Learn one whole job from start to finish, with the real screen beside each step.", href: "#walkthroughs", c: "See walkthroughs" },
              { icon: "layers" as const, t: "Look up a feature", x: "Pick the product you use and find the guide for the exact feature.", href: "#products", c: "Browse guides by product" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}><Link href={c.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"><span className="sr-icon mb-5 h-14 w-14 transition-transform group-hover:scale-110"><Icon name={c.icon} className="h-6 w-6" /></span><h3 className="text-xl font-black">{c.t}</h3><p className="mt-2 flex-1 leading-relaxed text-muted-foreground">{c.x}</p><span className="mt-5 inline-flex items-center gap-2 font-bold text-primary">{c.c}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></Link></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 02 learning path */}
      <section id="path" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="02" icon="rocket" eyebrow="Learning path" title="Where to begin," accent="in order." lead="If you are new, follow these guides in order. By the end your business workspace is set up, your team is in, your records are loaded and the routine work runs by itself." />
          <NumberedRows items={PATH.flatMap((x) => { const d = DOCS.find((y) => y.slug === x.slug); return d ? [{ title: x.title, text: x.text, tag: `${d.readMinutes} min`, href: `/docs/${d.slug}` }] : []; })} />
        </div>
      </section>

      {/* 03 walkthroughs */}
      <section id="walkthroughs" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="03" icon="rocket" eyebrow="Walkthroughs" title="Learn a job" accent="start to finish." lead="Each walkthrough takes you through one real job, one step at a time, with the real screen beside every step." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {TUTORIALS.map((t, i) => (
              <Reveal key={t.slug} delay={(i % 3) * 60}>
                <Link href={`/docs/walkthroughs/${t.slug}`} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider"><span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">Walkthrough</span><span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{t.minutes} min · {t.level}</span></div>
                  <h3 className="text-lg font-black leading-snug group-hover:text-primary">{t.title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted-foreground">{t.summary}</p>
                  <p className="mt-3 text-xs font-bold text-muted-foreground">{t.steps.length} steps</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary">Start the walkthrough<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 04 general guides */}
      <section id="guides" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="04" icon="book" eyebrow="General guides" title="The essentials" accent="every business needs." lead="Guides that apply to the whole software: setup, people and access, your brand, automation and AI. Each one lists the exact screens to open and what you will see." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {cats.map((c, i) => (
              <Reveal key={c.name} delay={(i % 3) * 60}>
                <div className="flex h-full flex-col rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3"><span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-sm font-black text-white shadow-md shadow-primary/25">{String(i + 1).padStart(2, "0")}</span><div><h3 className="font-black leading-tight">{c.name}</h3><p className="text-xs leading-snug text-muted-foreground">{c.blurb}</p></div></div>
                  <ul className="space-y-1">
                    {c.list.map((d) => (
                      <li key={d.slug}><Link href={`/docs/${d.slug}`} className="group flex items-start gap-2 rounded-xl px-2 py-2 text-[15px] font-semibold leading-snug transition-colors hover:bg-primary/[0.06] hover:text-primary"><BookOpen className="mt-0.5 h-4 w-4 flex-none text-primary" /><span className="flex-1">{d.title}</span><span className="flex-none text-xs font-bold text-muted-foreground">{d.readMinutes} min</span></Link></li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 05 guides by section */}
      <section id="products" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="05" icon="layers" eyebrow="Guides by product" title="Every feature of" accent="every product." lead="Product by product, here is every feature with its own guide. Click a feature to read what it does, what to check before you start, the steps in order, and a quick recap." />
          <div className="space-y-20">
            {explorer.map((p) => (
              <div key={p.key} id={p.key} className="scroll-mt-32">
                <SectionHead
                  icon={<ProductLogo productKey={p.key} size={34} title={p.name} />}
                  eyebrow="Product"
                  title="SelfRun"
                  accent={p.name.replace(/^SelfRun\s+/i, "")}
                  lead={p.summary}
                />
                <div className="-mt-6 mb-10 flex justify-center">
                  <Link href={productPath(p.key)} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-5 py-2.5 text-sm font-bold shadow-sm transition-colors hover:border-primary/40 hover:text-primary">See the product page <ArrowUpRight className="h-4 w-4" /></Link>
                </div>
                <div className="space-y-7">
                  {p.groups.map((g) => (
                    <section key={g.name} aria-label={`${p.name}: ${g.name}`}>
                      <h4 className="mb-3 flex items-center gap-3 px-1 text-xs font-black uppercase tracking-widest text-primary">{g.name}</h4>
                      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {g.items.map((f, i) => (
                          <li key={f.slug}>
                            <Link href={productDocsPath(p.key, f.slug)} className="group flex h-full gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">{String(i + 1).padStart(2, "0")}</span>
                              <span className="min-w-0 flex-1"><span className="block font-black leading-snug group-hover:text-primary">{f.name}</span><span className="mt-1 line-clamp-2 block text-sm leading-snug text-muted-foreground">{f.text}</span></span>
                              <ArrowUpRight className="mt-0.5 h-4 w-4 flex-none text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 06 help */}
      <section id="help" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="06" icon="chat" eyebrow="Need help" title="Stuck on" accent="something?" lead="If a guide does not answer your question, there are other ways to get unstuck. Inside the product, the AI help assistant also knows which screen you are on." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "chat" as const, t: "Ask the team", x: "Write to us and we reply within one business day.", href: "/contact" },
              { icon: "target" as const, t: "Request a demo", x: "See it with examples from your own business.", href: "/demo" },
              { icon: "search" as const, t: "Read the FAQs", x: "Short answers to common questions.", href: "/faqs" },
              { icon: "chart" as const, t: "Check the status", x: "See whether everything is running right now.", href: "/status" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 60}><Link href={c.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"><span className="sr-icon mb-4 h-12 w-12"><Icon name={c.icon} className="h-5 w-5" /></span><h3 className="text-lg font-black">{c.t}</h3><p className="mt-1 flex-1 text-[15px] leading-relaxed text-muted-foreground">{c.x}</p><span className="mt-4 inline-flex items-center gap-2 font-bold text-primary">Open<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></Link></Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
      <FaqSection n="07" topics={["Setup", "Support", "General"]} limit={5} />
    </>
  );
}
