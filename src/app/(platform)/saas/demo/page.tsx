import { breadcrumbList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import InquiryForm from "@/components/platform/saas/InquiryForm";
import { Blobs, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Reveal from "@/components/platform/saas/Reveal";
import DemoExperience from "@/components/platform/saas/DemoExperience";
import DemoAgenda from "@/components/platform/saas/DemoAgenda";

export const metadata: Metadata = pageMeta({ path: "/demo", title: "Request a Demo or Try the Live Workspace", description: "See SRB AI run your own scenarios: CRM, HR, finance, projects, AI and automation. Book a guided session or explore the live demo workspace on your own.", keywords: ["business software demo", "CRM demo", "HR software demo", "free software demo", "live demo workspace", "request a software demo", "try business software free", "book a demo"], tag: "Demo" });

const NAV = [
  { id: "self-guided-demo", label: "Self-guided tour" },
  { id: "session", label: "Guided session" },
  { id: "faq", label: "FAQs" },
];

export const dynamic = "force-dynamic";

export default async function DemoPage() {
  return (
    <>
      <JsonLd data={[webPage({ type: "WebPage", path: "/demo", name: "Request a demo", description: "See SRB AI run your own scenarios: CRM, HR, finance, projects, AI and automation. Book a guided session or explore the live demo workspace on your own." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Demo", path: "/demo" }])]} />
      <PageHero art="demo" photo="presentation" shot="workspace" shotName="SRB CommandOS" eyebrow="Request a demo" title="See your business" accent="running on SRB." lead="In a 30-minute session we map the platform to your own processes and show how much of the repetitive work it can take over." chip={{ title: "30-minute walkthrough", text: "Built around your own scenarios" }}>
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
      <FaqSection n="03" topics={["General", "Setup", "Plans & pricing"]} limit={5} title="Before your" accent="demo." lead="What people ask before booking a walkthrough." />
    </>
  );
}
