import { breadcrumbList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import InquiryForm from "@/components/platform/saas/InquiryForm";
import { Blobs, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Icon from "@/components/platform/saas/Icon";
import ProductLogo from "@/components/products/ProductLogo";
import { ArrowRight, Check } from "lucide-react";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { productPath } from "@/lib/platform/saas/product-routes";
import Reveal from "@/components/platform/saas/Reveal";
import DemoExperience from "@/components/platform/saas/DemoExperience";
import DemoAgenda from "@/components/platform/saas/DemoAgenda";

export const metadata: Metadata = pageMeta({ path: "/demo", title: "Request a Demo or Try the Live Workspace", description: "See SelfRun AI run your own scenarios: CRM, HR, finance, projects, AI and automation. Book a guided session or explore the live demo workspace on your own.", keywords: ["business software demo", "CRM demo", "HR software demo", "free software demo", "live demo workspace", "request a software demo", "try business software free", "book a demo"], tag: "Demo" });

const NAV = [
  { id: "self-guided-demo", label: "Self-guided tour" },
  { id: "session", label: "Guided session" },
  { id: "cover", label: "What we cover" },
  { id: "prepare", label: "How to prepare" },
  { id: "after", label: "After the demo" },
  { id: "faq", label: "FAQs" },
];

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const groups = await getFeatureGroups();
  return (
    <>
      <JsonLd data={[webPage({ type: "WebPage", path: "/demo", name: "Request a demo", description: "See SelfRun AI run your own scenarios: CRM, HR, finance, projects, AI and automation. Book a guided session or explore the live demo workspace on your own." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Demo", path: "/demo" }])]} />
      <PageHero art="demo" photo="presentation" shot="workspace" shotName="SelfRun CommandOS" eyebrow="Request a demo" title="See your business" accent="running on SelfRun." lead="In a 30-minute session we map the platform to your own processes and show how much of the repetitive work it can take over." chip={{ title: "30-minute walkthrough", text: "Built around your own scenarios" }}>
        <HeroCtas primary={{ label: "Try the interactive demo", href: "#self-guided-demo" }} secondary={{ label: "Get started free", href: "/signup" }} />
      </PageHero>
      <SectionScrollNav items={NAV} label="Demo sections" numbered />
      <DemoExperience />
      <section id="session" className="sr-section relative" style={{ scrollMarginTop: 140 }}>
        <Blobs />
        <div className="sr-grid-bg" aria-hidden />
        <div className="sr-container relative">
          <SectionHead n="02" icon="rocket" eyebrow="Guided walkthrough" title="Make the demo" accent="about your business." lead="Bring one process you want to improve. We’ll focus the session on your team’s workflow and leave time for your questions." />
          <div className="grid items-stretch gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <div className="flex flex-col space-y-5 h-full">
            <Reveal className="h-full"><DemoAgenda /></Reveal>
            <p className="px-1 text-sm text-muted-foreground">Prefer to explore independently? <a href="#self-guided-demo" className="font-bold text-primary">Open the interactive product tour above</a>, or <Link href="/signup" className="font-bold text-primary">get started free</Link>.</p>
          </div>
          <Reveal delay={80} className="group relative h-full">
            {/* the system's gradient edge glow, blooming behind the form on hover (FeatureGrid pattern) */}
            <span className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary/25 via-primary/0 to-brand-accent/25 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" aria-hidden />
            <div className="relative rounded-[1.75rem] border border-border/60 bg-card p-5 shadow-sm transition-all duration-500 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/10 sm:p-7 h-full flex flex-col">
              <p className="sr-eyebrow">Request a session</p>
              <h3 className="mt-2 text-2xl font-black">Let’s plan your walkthrough</h3>
              <p className="mb-5 mt-2 text-sm leading-relaxed text-muted-foreground">Share a few details and the team will follow up to arrange a session around your needs.</p>
              <InquiryForm kind="demo" />
            </div>
          </Reveal>
          </div>
        </div>
      </section>
      <section id="cover" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="03" icon="layers" eyebrow="What we cover" title="Any product," accent="any workflow." lead="We focus the session on the products and processes that matter to you. Here is everything we can show." />
          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map((g, i) => (
              <Reveal key={g.id} delay={(i % 2) * 60}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3"><span className="sr-icon h-11 w-11 flex-none"><Icon name={g.icon} className="h-5 w-5" /></span><div><h3 className="font-black leading-tight">{g.title}</h3><p className="text-xs text-muted-foreground">{g.lead}</p></div></div>
                  <ul className="grid gap-2 sm:grid-cols-2">{g.items.map((m) => <li key={m.key}><Link href={productPath(m.key)} className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-2.5 transition-all hover:border-primary/40 hover:shadow-md"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border/60 bg-card"><ProductLogo productKey={m.key} size={28} title={m.name} /></span><span className="min-w-0 text-sm font-black leading-tight group-hover:text-primary">{m.name}</span></Link></li>)}</ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="prepare" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="04" icon="check" eyebrow="How to prepare" title="Come with one process," accent="leave with a picture." lead="You do not need to prepare much. These make the session more useful." />
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {[
              { icon: "target" as const, t: "Pick one process", x: "A workflow that slows your team down today, such as lead follow-up, approvals or reporting." },
              { icon: "users" as const, t: "Bring who it touches", x: "People who do the work can tell us where it really gets stuck." },
              { icon: "chat" as const, t: "List your questions", x: "Security, plans, your brand or data import, there is time to ask." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}><div className="h-full rounded-3xl border border-border/60 bg-card p-7 shadow-sm"><span className="sr-icon mb-5 h-14 w-14"><Icon name={c.icon} className="h-6 w-6" /></span><h3 className="text-xl font-black">{c.t}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{c.x}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="after" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="05" icon="rocket" eyebrow="After the demo" title="Then it is" accent="your call." lead="No pressure and no lock-in. You decide what to do next." />
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {[
              { t: "Start free", x: "Create a workspace and try it on your own data. No card needed.", href: "/signup", c: "Get started free" },
              { t: "Read the guides", x: "Follow step-by-step walkthroughs for the products you liked.", href: "/docs", c: "Open the docs" },
              { t: "Ask more questions", x: "Anything we did not cover, send it our way.", href: "/contact", c: "Contact us" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}><Link href={c.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"><h3 className="text-xl font-black">{c.t}</h3><p className="mt-2 flex-1 leading-relaxed text-muted-foreground">{c.x}</p><span className="mt-5 inline-flex items-center gap-2 font-bold text-primary">{c.c}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></Link></Reveal>
            ))}
          </div>
        </div>
      </section>
      <FaqSection n="06" topics={["General", "Setup", "Plans & pricing"]} limit={5} title="Before your" accent="demo." lead="What people ask before booking a walkthrough." />
    </>
  );
}
