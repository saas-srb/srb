import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import FindWorkspaceForm from "@/components/platform/saas/FindWorkspaceForm";
import { Blobs, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import ProductLogo from "@/components/products/ProductLogo";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { productPath } from "@/lib/platform/saas/product-routes";
import { productShort } from "@/lib/platform/saas/product-short";
import Reveal from "@/components/platform/saas/Reveal";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

export const metadata: Metadata = pageMeta({ path: "/login", title: "Log In to Your Workspace", description: "Sign in to your SelfRun AI workspace with your company's own address. New here? Create a free workspace in minutes.", keywords: ["SelfRun AI login", "business software sign in"], tag: "Log in", noindex: true });

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Enter your workspace address",
    text: "Type your company slug (e.g. acme) or your custom domain. It's in your invitation email or the URL you use every day.",
  },
  {
    step: "02",
    title: "Land on your company's sign-in",
    text: "We route you to your workspace's own login page — isolated from every other company on the platform.",
  },
  {
    step: "03",
    title: "One login, every product",
    text: "Sign in once and reach HR, Projects, CRM, Finance, AI and every other product your role gives you access to.",
  },
];


const TRUST = [
  "Role-based access — each person sees only what their role allows",
  "Full audit trail on every action across every product",
  "Encrypted credentials and strict company isolation",
  "Rate-limited sign-in with optional two-factor auth",
  "Your own workspace address or custom domain with automatic SSL",
  "Data never shared between companies — scoped at the database layer",
];


const NAV = [
  { id: "signin", label: "How sign-in works" },
  { id: "inside", label: "What is inside" },
  { id: "trust", label: "Security" },
  { id: "help", label: "Need help" },
  { id: "new", label: "New here" },
  { id: "faq", label: "FAQs" },
];

export default async function LoginPage() {
  const modules = await getFeatureModules();
  return (
    <>
      <PageHero
        art="login"
        photo="team-desk"
        shot="workspace"
        shotName="Workspace"
        eyebrow="Log in"
        title="Sign in to"
        accent="your workspace."
        lead={<>Every company has its own workspace address. Enter yours and we&apos;ll take you to its sign-in page. New here? <Link href="/signup" className="font-bold text-primary">Get started free</Link>.</>}
      >
        <div className="flex w-full flex-col gap-5"><div className="w-full max-w-md"><FindWorkspaceForm /></div><div className="flex flex-wrap items-center gap-3"><HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Request a demo", href: "/demo" }} /></div></div>
      </PageHero>

      {/* ── How it works + form ── */}
      <SectionScrollNav items={NAV} label="Sign-in sections" numbered />
      <section id="signin" className="sr-section relative bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <Blobs />
        <div className="sr-grid-bg" aria-hidden />
        <div className="sr-container relative">
          <SectionHead
            n="01"
            icon="lock"
            eyebrow="How sign-in works"
            title="Your address,"
            accent="your workspace."
            lead="SelfRun is multi-tenant — every company is completely isolated. Your workspace address is the key that takes you straight to your company's sign-in."
          />

          <div className="grid items-stretch gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">

            {/* Left: 3-step flow */}
            <Reveal className="flex flex-col gap-4">
              {HOW_IT_WORKS.map(({ step, title, text }) => (
                <div key={step} className="group relative flex gap-5 rounded-[1.5rem] border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/8 sm:p-6">
                  <span className="sr-numeral text-7xl font-black leading-none">{step}</span>
                  <div className="relative z-10">
                    <p className="sr-eyebrow">Step {step}</p>
                    <p className="mt-1 text-lg font-black leading-snug">{title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-5">
                <p className="text-sm font-bold">Don't know your workspace address?</p>
                <p className="mt-1 text-sm text-muted-foreground">Check your invitation email — it contains your workspace URL. Or ask your company's Director.</p>
                <Link href="/contact" className="sr-link mt-3 inline-flex">
                  Contact support <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>

            {/* Right: form card */}
            <Reveal delay={80} className="group relative h-full">
              <span className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary/25 via-primary/0 to-brand-accent/25 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" aria-hidden />
              <div className="relative flex h-full flex-col rounded-[1.75rem] border border-border/60 bg-card p-5 shadow-sm transition-all duration-500 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/10 sm:p-7">
                <p className="sr-eyebrow">Find your workspace</p>
                <h3 className="mt-2 text-2xl font-black">Enter your workspace address</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Your slug (e.g. <span className="font-semibold text-foreground">acme</span>) or custom domain — it's in your invitation email.
                </p>
                <div className="mt-6">
                  <FindWorkspaceForm plain />
                </div>
                <div className="mt-6 space-y-2">
                  {["No separate login per product", "Works on any device — browser or installed app", "Session stays active across all your products"].map((t) => (
                    <p key={t} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> {t}
                    </p>
                  ))}
                </div>
                <div className="mt-auto pt-6 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">
                    Don't have a workspace?{" "}
                    <Link href="/signup" className="font-bold text-primary hover:underline inline-flex items-center gap-1">
                      Get started free — it's free forever <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </p>
                </div>
              </div>
            </Reveal>

          </div>
        </div>
      </section>

      {/* ── Products inside the workspace ── */}
      <section id="inside" className="sr-section relative" style={{ scrollMarginTop: 140 }}>
        <Blobs />
        <div className="sr-container relative">
          <SectionHead
            n="02"
            icon="layers"
            eyebrow="What's inside"
            title="Every product,"
            accent="one sign-in."
            lead="Sign in once and your sidebar shows every product your plan includes and your role gives you access to — no separate logins, no switching accounts."
          />
          <Reveal>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {modules.map((m, i) => (
                <Link key={m.key} href={productPath(m.key)} className="group relative block">
                  <div className="pointer-events-none absolute -inset-1 rounded-[1.75rem] bg-gradient-to-br from-primary/25 via-primary/0 to-brand-accent/25 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="sr-card relative h-full overflow-hidden group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/10">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-brand-accent/10 opacity-70" />
                    <span className="pointer-events-none absolute -right-1 -top-3 select-none text-5xl font-black text-muted-foreground/[0.07] transition-colors duration-500 group-hover:text-primary/10">{String(i + 1).padStart(2, "0")}</span>
                    <div className="relative">
                      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm"><ProductLogo productKey={m.key} size={40} title={m.name} /></span>
                      <p className="font-black leading-snug">{m.name}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{productShort(m.key, m.summary)}</p>
                      <ul className="mt-3 space-y-1">
                        {m.capabilities.slice(0, 3).map((d) => (
                          <li key={d} className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3 w-3 shrink-0 text-primary" />{d}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Security & trust ── */}
      <section id="trust" className="sr-section relative bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <Blobs />
        <div className="sr-grid-bg" aria-hidden />
        <div className="sr-container relative">
          <SectionHead
            n="03"
            icon="shield"
            eyebrow="Security & trust"
            title="Built for"
            accent="real businesses."
            lead="Every workspace is isolated, every action is logged, and every person sees only what their role allows."
          />
          <Reveal>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TRUST.map((t) => (
                <div key={t} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-relaxed">{t}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={80} className="mt-8">
            <div className="sr-band rounded-3xl p-6 shadow-xl shadow-primary/20 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-black text-white">Ready to get started?</p>
                  <p className="mt-1 text-sm text-white/70">Free plan includes every product. No credit card, no trial expiry.</p>
                </div>
                <Link
                  href="/signup"
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
                >
                  Create your workspace free <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Need help ── */}
      <section id="help" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="04" icon="chat" eyebrow="Need help" title="Can't sign in?" accent="Start here." lead="Most sign-in problems are one of these. If none fits, our team will help." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { t: "Find your workspace address", x: "It is in your invitation email, in the link you use every day, or ask your company's Director.", href: "/docs/getting-started", c: "Read the setup guide" },
              { t: "Check the platform is up", x: "If sign-in is failing for everyone, an open incident notice will be shown on the status page.", href: "/status", c: "Open the status page" },
              { t: "Ask our team", x: "Tell us your company name and what you see. We reply within one business day.", href: "/contact", c: "Contact support" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}>
                <Link href={c.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <h3 className="text-xl font-black">{c.t}</h3>
                  <p className="mt-2 flex-1 leading-relaxed text-muted-foreground">{c.x}</p>
                  <span className="mt-5 inline-flex items-center gap-2 font-bold text-primary">{c.c}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── New here ── */}
      <section id="new" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <SectionHead n="05" icon="rocket" eyebrow="New here" title="No workspace yet?" accent="Create one free." lead="Register your company, brand it, invite your team and switch on the products you need." />
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {[{ t: "Register", x: "Use your work email. No card needed." }, { t: "Set up", x: "Name and brand the workspace, then invite your team with roles." }, { t: "Start working", x: "Switch on the products you need. Every product is in every plan." }].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}><div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm"><span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-lg font-black text-white">{i + 1}</span><h3 className="text-lg font-black">{c.t}</h3><p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{c.x}</p></div></Reveal>
            ))}
          </div>
          <div className="mt-10 flex justify-center"><HeroCtas primary={{ label: "Create your workspace", href: "/signup" }} secondary={{ label: "Request a demo", href: "/demo" }} /></div>
        </div>
      </section>

      <FaqSection n="06" topics={["Setup", "Data & security", "General"]} limit={5} />
    </>
  );
}
