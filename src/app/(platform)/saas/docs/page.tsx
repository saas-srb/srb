import { breadcrumbList, itemList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { featuresOf } from "@/lib/platform/saas/feature-lists";
import { TUTORIALS } from "@/lib/platform/saas/tutorials";
import { CtaBand, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import DocsSearch, { type DocEntry } from "@/components/platform/saas/DocsSearch";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/docs", title: "Documentation: Guides and Walkthroughs", description: "Step-by-step guides and walkthroughs for every feature of SRB AI, with the real screen beside each step. Set up your business workspace and learn each product.", keywords: ["business software documentation", "CRM user guide", "HR software setup guide", "payroll software how to", "project management software tutorial", "accounting software guide", "SaaS help center", "how to set up business software", "step by step software guides"], tag: "Docs" });

const NAV = [
  { id: "start", label: "Start here" },
  { id: "help", label: "Need help" },
  { id: "faq", label: "FAQs" },
];

export default async function DocsPage() {
  const groups = await getFeatureGroups();
  const panels = groups.flatMap((g) => g.items);
  const entries: DocEntry[] = panels.flatMap((m) => featuresOf(m.key).map((f) => ({ panelKey: m.key, panel: m.name, slug: f.slug, name: f.name, text: f.text })));

  return (
    <>
      <JsonLd data={[webPage({ type: "CollectionPage", path: "/docs", name: "Documentation", description: "Step-by-step guides and walkthroughs for every feature of SRB AI, with the real screen beside each step. Set up your business workspace and learn each product." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Documentation", path: "/docs" }]), itemList({ name: "SRB AI walkthroughs", items: TUTORIALS.map((t) => ({ name: t.title, path: `/docs/walkthroughs/${t.slug}` })) })]} />
      <PageHero art="docs" eyebrow="A guide for every feature · general guides · walkthroughs" title="Learn SRB AI" accent="one step at a time." lead="Everything you need to set up SRB AI and use it every day, from creating your account to running payroll or publishing your website. Every guide shows the real screen and the exact steps to follow. New here? Follow the learning path below, or search for the job you want to do." photo="laptop-talk" shot="support" shotName="SRB ResolveIQ">
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Need help?", href: "#help" }} />
      </PageHero>

      <SectionScrollNav items={NAV} label="Documentation products" numbered />

      {/* 01 start */}
      <section id="start" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="01" icon="search" eyebrow="Start here" title="What do you want" accent="to do?" lead="Search the guides by what you want to do, or choose the way you prefer to learn." />
          <Reveal className="mb-12"><DocsSearch entries={entries} large /></Reveal>
          <div className="grid gap-5 md:grid-cols-2">
            {[
              { icon: "rocket" as const, t: "Set up your workspace", x: "From a new account to a working business workspace, step by step.", href: "/docs/getting-started", c: "Open the setup guide" },
              { icon: "layers" as const, t: "Browse products", x: "See every product included in your workspace and what it does.", href: "/products", c: "View all products" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}><Link href={c.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"><span className="sr-icon mb-5 h-14 w-14 transition-transform group-hover:scale-110"><Icon name={c.icon} className="h-6 w-6" /></span><h3 className="text-xl font-black">{c.t}</h3><p className="mt-2 flex-1 leading-relaxed text-muted-foreground">{c.x}</p><span className="mt-5 inline-flex items-center gap-2 font-bold text-primary">{c.c}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></Link></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 02 help */}
      <section id="help" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="02" icon="chat" eyebrow="Need help" title="Stuck on" accent="something?" lead="If a guide does not answer your question, there are other ways to get unstuck. Inside the product, the AI help assistant also knows which screen you are on." />
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
      <FaqSection n="03" topics={["Setup", "Support", "General"]} limit={5} />
    </>
  );
}
