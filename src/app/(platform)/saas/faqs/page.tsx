import { breadcrumbList, faqPage, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import { CtaBand, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Reveal from "@/components/platform/saas/Reveal";
import Icon from "@/components/platform/saas/Icon";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import FaqHub from "@/components/platform/saas/FaqHub";
import { FAQ_GROUPS } from "@/lib/platform/saas/faqs";

export const metadata: Metadata = pageMeta({ path: "/faqs", title: "FAQs: Answers for Every Product", description: "Answers about SelfRun AI and every one of its products: CRM, HR, finance, projects, AI, security, pricing, setup and your own brand. Search over a thousand answers.", keywords: ["SelfRun AI FAQ", "business software FAQs", "CRM software questions", "HR software questions", "payroll software FAQ", "accounting software FAQ", "how does business automation software work", "SaaS security questions", "white label software FAQ"], tag: "FAQs" });

const NAV = [
  { id: "browse", label: "Browse answers" },
  { id: "how", label: "How we answer" },
  { id: "more", label: "Still have questions" },
  { id: "start", label: "Start here" },
];

export default function FaqsPage() {
  return (
    <>
      <JsonLd data={[webPage({ type: "CollectionPage", path: "/faqs", name: "FAQs", description: "Answers about SelfRun AI and every one of its products: CRM, HR, finance, projects, AI, security, pricing, setup and your own brand. Search over a thousand answers." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "FAQs", path: "/faqs" }]), faqPage(FAQ_GROUPS.find((g) => g.id === "general")?.items.slice(0, 20).map(({ q, a }) => ({ q, a })) ?? [])]} />
      <PageHero
        art="features"
        eyebrow="SelfRun answers"
        title="Questions about"
        accent="how it works?"
        lead="Browse system-wide guidance or choose a product for answers about its actual workflows and capabilities."
        photo="analytics"
        shot="workspace"
        shotName="SelfRun workspace"
      >
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Contact us", href: "/contact" }} />
      </PageHero>
      <SectionScrollNav items={NAV} label="FAQ sections" numbered />
      <FaqHub
        groups={FAQ_GROUPS.map(({ id, title, href, items }) => ({
          id,
          title,
          href,
          items: items.map(({ q, a }) => ({ q, a })),
        }))}
      />

      <section id="how" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="02" icon="check" eyebrow="How we answer" title="Answers you can" accent="rely on." lead="These answers describe what the product does today, and nothing we hope it will do." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: "check" as const, t: "Product-specific", x: "Each product has its own questions, written from how it actually works." },
              { icon: "search" as const, t: "Searchable", x: "Search across every answer at once, or pick one product to see only its questions." },
              { icon: "shield" as const, t: "Honest", x: "If the product does not do something, the answer says so instead of working around it." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}><div className="h-full rounded-3xl border border-border/60 bg-card p-7 shadow-sm"><span className="sr-icon mb-5 h-14 w-14"><Icon name={c.icon} className="h-6 w-6" /></span><h3 className="text-xl font-black">{c.t}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{c.x}</p></div></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="more" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="03" icon="chat" eyebrow="Still have questions" title="Can't find" accent="your answer?" lead="Another place may have it, or the team can help directly." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "book" as const, t: "Documentation", x: "Step-by-step guides for every product.", href: "/docs" },
              { icon: "target" as const, t: "Request a demo", x: "See it with your own scenarios.", href: "/demo" },
              { icon: "chat" as const, t: "Contact us", x: "We reply within one business day.", href: "/contact" },
              { icon: "chart" as const, t: "Status", x: "Is the platform up right now?", href: "/status" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 60}><Link href={c.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"><span className="sr-icon mb-4 h-12 w-12"><Icon name={c.icon} className="h-5 w-5" /></span><h3 className="text-lg font-black">{c.t}</h3><p className="mt-1 flex-1 text-[15px] leading-relaxed text-muted-foreground">{c.x}</p><span className="mt-4 inline-flex items-center gap-2 font-bold text-primary">Open<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></Link></Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="start" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="04" icon="rocket" eyebrow="Start here" title="Better than reading:" accent="trying it." lead="Every product and feature is in every plan, starting free." />
          <div className="flex justify-center"><HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Request a demo", href: "/demo" }} /></div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
