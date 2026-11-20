import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import FindWorkspaceForm from "@/components/platform/saas/FindWorkspaceForm";
import { Blobs, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Reveal from "@/components/platform/saas/Reveal";
import { ArrowRight, Check } from "lucide-react";

export const metadata: Metadata = pageMeta({ path: "/login", title: "Log In to Your Workspace", description: "Sign in to your SRB AI workspace with your company's own address. New here? Create a free workspace in minutes.", keywords: ["SRB AI login", "business software sign in"], tag: "Log in", noindex: true });

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

const NAV = [
  { id: "signin", label: "How sign-in works" },
  { id: "faq", label: "FAQs" },
];

export default function LoginPage() {
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
            lead="SRB is multi-tenant — every company is completely isolated. Your workspace address is the key that takes you straight to your company's sign-in."
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

      <FaqSection n="02" topics={["Setup", "Data & security", "General"]} limit={5} />
    </>
  );
}
