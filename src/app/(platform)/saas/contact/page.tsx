import { breadcrumbList, organizationPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import InquiryForm from "@/components/platform/saas/InquiryForm";
import { HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import { TimelineSteps } from "@/components/platform/saas/Modern";
import FaqSection from "@/components/platform/saas/FaqSection";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Reveal from "@/components/platform/saas/Reveal";
import Icon from "@/components/platform/saas/Icon";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { requestHostOrNull } from "@/lib/platform/saas/request";
import { saasCanonicalHost } from "@/lib/platform/saas/hosts";
import { saasContact } from "@/lib/platform/saas/brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/contact", title: "Contact Us: Sales, Support and Security", description: "Talk to the SelfRun AI team about plans, a demo, support or security. Send a message and we reply within one business day.", keywords: ["contact SelfRun AI", "business software sales contact", "software support contact", "request business software demo", "talk to sales", "SelfRun AI support", "report a security issue"], tag: "Contact" });

const NAV = [
  { id: "reach", label: "Reach the right team" },
  { id: "next", label: "What happens next" },
  { id: "include", label: "What to include" },
  { id: "self", label: "Find it yourself" },
  { id: "start", label: "Or just start" },
  { id: "faq", label: "FAQs" },
];

export default async function ContactPage() {
  const c = saasContact(saasCanonicalHost(await requestHostOrNull()));
  const ways = [
    { t: "Sales and demos", v: c.sales, d: "Plans, pricing and a walkthrough for your team." },
    { t: "Customer support", v: c.support, d: "Existing customers can also open a request from inside their workspace." },
    { t: "Security", v: c.security, d: "Report a vulnerability or ask about our security practices." },
  ];
  return (
    <>
      <JsonLd data={[organizationPage({ type: "ContactPage", path: "/contact", name: "Contact us", description: "Talk to the SelfRun AI team about plans, a demo, support or security. Send a message and we reply within one business day." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Contact us", path: "/contact" }])]} />
      <PageHero art="contact" photo="colleagues" shot="support" shotName="SelfRun ResolveIQ" eyebrow="Contact Us" title="Let's talk about" accent="your business." lead="Questions about plans, how the platform fits your business, or security? Send a message and we'll reply within one business day." chip={{ title: "Reply within one business day", text: "From the people who build the platform" }}>
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Request a demo", href: "/demo" }} />
      </PageHero>
      <SectionScrollNav items={NAV} label="Contact sections" numbered />
      <section id="reach" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="01" icon="chat" eyebrow="Get in touch" title="Reach the" accent="right team." lead="Pick the address that fits, or send a message with the form and we will route it for you." />
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
          <div className="space-y-4">
            {ways.map((w) => (
              <div key={w.t} className="group flex gap-5 border-t border-border/70 py-6 transition-all hover:bg-gradient-to-r hover:from-primary/[0.06] hover:to-transparent hover:pl-2">
                <span className="sr-outline w-14 flex-none text-4xl font-black leading-none" aria-hidden>{String(ways.indexOf(w) + 1).padStart(2, "0")}</span>
                <div className="space-y-1">
                  <p className="text-lg font-black group-hover:text-primary">{w.t}</p>
                  <a href={`mailto:${w.v}`} className="break-all text-sm font-semibold text-primary">{w.v}</a>
                  <p className="text-sm text-muted-foreground">{w.d}</p>
                </div>
              </div>
            ))}
          </div>
          <InquiryForm kind="contact" />
          </div>
        </div>
      </section>

      <section id="next" className="sr-band sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container relative">
          <SectionHead n="02" tone="dark" icon="workflow" eyebrow="What happens next" title="From your message" accent="to a reply." lead="Three simple steps — no queue of forms, no sales script." />
          <TimelineSteps cols={3} items={[
            { title: "Tell us what you need", text: "Send the form or write to the address that fits — plans, a demo, support or security.", icon: "chat" },
            { title: "The right team picks it up", text: "Sales, support and security each have their own address, so your message goes to people who can answer it.", icon: "users" },
            { title: "You hear back in one business day", text: "We reply within one business day — from the people who build the platform.", icon: "rocket" },
          ]} />
        </div>
      </section>

      <section id="include" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="03" icon="file" eyebrow="What to include" title="Help us reply" accent="faster." lead="A few details let the right person answer in one go, without back and forth." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "building" as const, t: "Your company", x: "Its name and what it does." },
              { icon: "target" as const, t: "What you want to achieve", x: "The workflow you want to improve, in a sentence or two." },
              { icon: "layers" as const, t: "Products you are looking at", x: "Which products or areas matter most to you." },
              { icon: "users" as const, t: "Team size", x: "Roughly how many people will use it." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 60}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm"><span className="sr-icon mb-4 h-12 w-12"><Icon name={c.icon} className="h-5 w-5" /></span><h3 className="text-lg font-black leading-snug">{c.t}</h3><p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{c.x}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="self" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="04" icon="search" eyebrow="Find it yourself" title="Maybe the answer" accent="is already here." lead="These pages answer most questions straight away." />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: "book" as const, t: "Documentation", x: "Step-by-step guides and walkthroughs for every product.", href: "/docs" },
              { icon: "chart" as const, t: "Status", x: "Is the platform up right now? Open incident notices show here.", href: "/status" },
              { icon: "shield" as const, t: "Security and trust", x: "How data is protected, separated and handled.", href: "/security" },
              { icon: "wallet" as const, t: "Plans and pricing", x: "What every plan includes, starting free.", href: "/pricing" },
              { icon: "rocket" as const, t: "Product roadmap", x: "What is available today and how feedback is handled.", href: "/roadmap" },
              { icon: "layers" as const, t: "All products", x: "Every product and what it does.", href: "/products" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={(i % 3) * 60}>
                <Link href={c.href} className="group flex h-full gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"><span className="sr-icon h-12 w-12 flex-none"><Icon name={c.icon} className="h-5 w-5" /></span><span><span className="block font-black">{c.t}</span><span className="block text-sm leading-snug text-muted-foreground">{c.x}</span><span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary">Open<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span></Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="start" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="05" icon="bolt" eyebrow="Or just start" title="Prefer to try it" accent="first?" lead="You do not have to talk to anyone to begin." />
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
            <Reveal><div className="h-full rounded-3xl bg-gradient-to-br from-primary to-brand-accent p-8 text-white shadow-2xl shadow-primary/25"><h3 className="text-2xl font-black">Start free</h3><p className="mt-2 text-white/85">Register with your work email and switch on the products you need. Every product is in every plan.</p><ul className="mt-4 space-y-2">{["No card needed", "Every product and feature included"].map((x) => <li key={x} className="flex gap-2.5 font-semibold"><Check className="mt-0.5 h-5 w-5 flex-none" strokeWidth={3} />{x}</li>)}</ul><Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-primary shadow-lg">Get started free <ArrowRight className="h-4 w-4" /></Link></div></Reveal>
            <Reveal delay={80}><div className="h-full rounded-3xl border border-border/60 bg-card p-8 shadow-sm"><h3 className="text-2xl font-black">See it with your scenarios</h3><p className="mt-2 text-muted-foreground">Bring one process you want to improve and we will show how the platform handles it.</p><ul className="mt-4 space-y-2">{["A guided session around your workflow", "Or explore the live demo on your own"].map((x) => <li key={x} className="flex gap-2.5 font-semibold"><Check className="mt-0.5 h-5 w-5 flex-none text-primary" strokeWidth={3} />{x}</li>)}</ul><Link href="/demo" className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background">Request a demo <ArrowRight className="h-4 w-4" /></Link></div></Reveal>
          </div>
        </div>
      </section>

      <FaqSection n="06" topics={["Support", "Setup", "General"]} limit={6} title="Before you" accent="write to us." lead="Quick answers to what people ask most." />
    </>
  );
}
