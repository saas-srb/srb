import Link from "next/link";
import { ArrowRight, ArrowUp, Lock, MessageCircle, PlayCircle, Scale, ShieldCheck } from "lucide-react";
import Logo from "@/components/platform/saas/Logo";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import { LEGAL_LINKS } from "@/lib/platform/saas/site";
import { productPath } from "@/lib/platform/saas/product-routes";

/** The legal and trust links, grouped by what a reader is looking for. */
const LEGAL_GROUPS: { title: string; note: string; icon: typeof Scale; hrefs: string[] }[] = [
  { title: "Legal", note: "The agreements and policies for using the service.", icon: Scale, hrefs: ["/terms", "/privacy", "/cookies", "/refund-policy", "/grievance"] },
  { title: "Your data", note: "How your information is handled, and your rights over it.", icon: Lock, hrefs: ["/data-policy", "/data-requests", "/dpa", "/subprocessors"] },
  { title: "Trust and security", note: "How the service is protected and kept running.", icon: ShieldCheck, hrefs: ["/security", "/sla", "/status", "/vulnerability-disclosure"] },
];

/** The footer: what the platform is, every product, the way in, the docs — and the legal pages beside the copyright line. */
export default async function Footer({}: { host?: string }) {
  const CATEGORIES: { title: string; products: { label: string; href: string }[] }[] = [
    { title: "Sales & marketing", products: [
      { label: "SelfRun DealFlow AI", href: productPath("lms") },
      { label: "SelfRun ViralPulse AI", href: productPath("smms") },
      { label: "SelfRun RankMax AI", href: productPath("seo") },
      { label: "SelfRun SiteCraft AI", href: productPath("cms") },
      { label: "SelfRun Sites", href: productPath("website") },
    ] },
    { title: "People & finance", products: [
      { label: "SelfRun TalentOS", href: productPath("hrms") },
      { label: "SelfRun Cohort AI", href: productPath("tms") },
      { label: "SelfRun EvalIQ", href: productPath("ots") },
      { label: "SelfRun CashFlow AI", href: productPath("fms") },
      { label: "SelfRun SprintOS", href: productPath("pms") },
    ] },
    { title: "Operations & control", products: [
      { label: "SelfRun CommandOS", href: productPath("workspace") },
      { label: "SelfRun SpendIQ", href: productPath("prms") },
      { label: "SelfRun Playbook AI", href: productPath("sop") },
      { label: "SelfRun ContractFlow AI", href: productPath("lpms") },
      { label: "SelfRun CyberVault", href: productPath("dlms") },
    ] },
    { title: "AI & collaboration", products: [
      { label: "SelfRun DataBrain AI", href: productPath("intelligence") },
      { label: "SelfRun AgentOS", href: productPath("aibots") },
      { label: "SelfRun Huddle AI", href: productPath("messenger") },
      { label: "SelfRun ClientOS", href: productPath("portal") },
      { label: "SelfRun ResolveIQ", href: productPath("support") },
    ] },
  ];
  const explore = [
    { href: "/ask", label: "Ask AI" },
    { href: "/pricing", label: "Pricing" },
    { href: "/faqs", label: "FAQs" },
    { href: "/blog", label: "Blog" },
    { href: "/about", label: "About Us" },
    { href: "/contact", label: "Contact Us" },
    { href: "/docs", label: "Documentation" },
  ];
  const productLinks = [
    { label: "Screen gallery", href: "/gallery" },
    { label: "All products", href: "/products" },
    { label: "Live demo", href: "/demo" },
    { label: "Our vision", href: "/vision" },
    { label: "Roadmap", href: "/roadmap" },
    { label: "Success stories", href: "/success-stories" },
    { label: "Getting started", href: "/onboarded-businesses" },
  ];
  return (
    <footer className="relative overflow-hidden border-t border-border/50 bg-muted/20">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="relative mx-auto max-w-[var(--sr-max)] px-6 py-9 lg:px-8">
        <div className="sr-band relative mb-9 rounded-[2rem] p-6 shadow-xl shadow-primary/25 sm:px-9 sm:py-7">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" aria-hidden />
          <div className="relative flex flex-col items-start gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black leading-tight tracking-tight sm:text-3xl">Put your business on <span className="text-white/70">autopilot.</span></h2>
              <p className="mt-1.5 max-w-xl text-[15px] text-white/80">Free forever, with every feature — or talk to the team first.</p>
            </div>
            <div className="flex w-full flex-none flex-row flex-wrap gap-3 lg:w-auto lg:flex-nowrap">
              <Link href="/signup" className="group inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-3 text-sm lg:flex-none lg:gap-2 lg:px-7 lg:text-[15px] font-bold text-black shadow-xl transition-transform hover:scale-105">Get started free <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></Link>
              <Link href="/demo" className="group inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/40 bg-white/10 px-3 py-3 text-sm lg:flex-none lg:gap-2 lg:px-7 lg:text-[15px] font-bold text-white backdrop-blur transition-all hover:bg-white/20"><PlayCircle className="h-5 w-5" />Live demo</Link>
              <Link href="/contact" className="group inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/40 bg-white/10 px-3 py-3 text-sm lg:flex-none lg:gap-2 lg:px-7 lg:text-[15px] font-bold text-white backdrop-blur transition-all hover:bg-white/20"><MessageCircle className="h-5 w-5" />Contact us</Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-3 lg:grid-cols-[2.2fr_0.7fr_repeat(5,1fr)]">
          <div className="col-span-2 space-y-4 md:col-span-3 lg:col-span-1">
            <Logo />
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{SAAS_BRAND.tagline}. One AI-powered platform for sales, people, finance, projects and your website — under your own brand, on web, Android, iOS and desktop.</p>
            <p className="text-xs text-muted-foreground">Free forever. Every feature included.</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold">Explore</p>
            <ul className="space-y-2">
              {explore.map((l) => <li key={l.href}><Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">{l.label}</Link></li>)}
            </ul>
          </div>
          {CATEGORIES.map((c) => (
            <div key={c.title}>
              <p className="mb-3 text-sm font-bold">{c.title}</p>
              <ul className="space-y-2">
                {c.products.map((product) => <li key={product.href}><Link href={product.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">{product.label}</Link></li>)}
              </ul>
            </div>
          ))}
          <div>
            <p className="mb-3 text-sm font-bold">Discover</p>
            <ul className="space-y-2">
              {productLinks.map((product) => <li key={product.href}><Link href={product.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">{product.label}</Link></li>)}
            </ul>
          </div>
        </div>

        <div className="mt-9 overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-sm backdrop-blur">
          <div className="border-b border-border/50 bg-gradient-to-r from-primary/[0.07] to-brand-accent/[0.07] px-6 py-4 sm:px-8">
            <p className="text-sm font-black">Trust center</p>
            <p className="text-sm text-muted-foreground">How we handle your data and keep the service running, in one place.</p>
          </div>
          <nav aria-label="Legal and trust" className="grid grid-cols-1 divide-y divide-border/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {LEGAL_GROUPS.map((g) => (
              <div key={g.title} className="px-6 py-6 sm:px-8">
                <p className="flex items-center gap-2.5 text-sm font-black"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><g.icon className="h-4 w-4" /></span>{g.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{g.note}</p>
                <ul className="mt-3 space-y-1.5">
                  {g.hrefs.flatMap((href) => { const l = LEGAL_LINKS.find((x) => x.href === href); return l ? [<li key={l.href}><Link href={l.href} className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"><ArrowRight className="h-3 w-3 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />{l.label}</Link></li>] : []; })}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-6 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {SAAS_BRAND.name}. All rights reserved.
            {SAAS_BRAND.operator ? <span> · Operated by {SAAS_BRAND.operator}</span> : null}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            <Link href="/status" className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:text-primary"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />System status</Link>
            <Link href="/data-requests" className="font-semibold transition-colors hover:text-primary">Privacy requests</Link>
            <Link href="/vulnerability-disclosure" className="font-semibold transition-colors hover:text-primary">Report a security issue</Link>
            <a href="#top" className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 font-bold text-foreground transition-colors hover:border-primary/40 hover:text-primary">Back to top <ArrowUp className="h-3 w-3" /></a>
          </p>
        </div>
      </div>
    </footer>
  );
}
