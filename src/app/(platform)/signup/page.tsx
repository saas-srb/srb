import "@/app/(platform)/saas/saas.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Globe, Layers, ShieldCheck, Sparkles, Users } from "lucide-react";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getSignupMode } from "@/lib/platform/settings";
import { platformRootDomain } from "@/lib/platform/tenancy/provisioning";
import SrRoot from "@/components/platform/saas/SrRoot";
import Header from "@/components/platform/saas/Header";
import Footer from "@/components/platform/saas/Footer";
import Interactions from "@/components/platform/saas/Interactions";
import { OfferTopBar } from "@/components/platform/saas/OfferChrome";
import MarketingShot from "@/components/platform/saas/MarketingShot";
import Reveal from "@/components/platform/saas/Reveal";
import { SectionHead } from "@/components/platform/saas/blocks";
import SignupForm from "./SignupForm";
import { resolveSignupPlan } from "@/lib/platform/billing/signup-plan";
import { trialLabel } from "@/lib/platform/billing/signup-plan-rule";
import { formatMoney } from "@/lib/platform/billing/types";

// Creating a workspace also starts writing its website in the background (AI), which can take a couple of minutes.
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Create your workspace",
  description: "Create your SelfRun AI workspace and run sales, HR, finance, projects and your website from one AI-powered platform. Free to start, no card needed.",
};

const POINTS = [
  { icon: Layers, t: "Every part of your business", x: "Customers, staff, money, projects, buying and training in one software." },
  { icon: Sparkles, t: "AI that helps", x: "Ask questions about your own records, and let automations handle the routine." },
  { icon: Globe, t: "Your own workspace and website", x: "Your own address, a website, and a page for your customers." },
  { icon: Users, t: "Your team, your rules", x: "Invite your team and give each person only the access they need." },
];

const STEPS = [
  { t: "Create your workspace", x: "A few seconds. No card needed." },
  { t: "Set up your business", x: "A short guided setup: details, departments and the products you want." },
  { t: "Invite your team", x: "Give each person a role, and start working." },
];

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string; interval?: string }> }) {
  // Sign-up belongs to the platform's own site, not to a company's workspace.
  if (!(await isPlatformOwnerContext())) notFound();
  const mode = await getSignupMode();
  const sp = await searchParams;
  // A plan picked on the pricing page: checked here, and again on the server when the form is sent.
  const picked = await resolveSignupPlan(sp.plan, sp.interval).catch(() => null);
  const selectedPlan = picked ? { id: picked.planId, name: picked.name, interval: picked.interval, trial: trialLabel(picked.trialDays), priceLabel: `${formatMoney(picked.price, picked.currency)} per ${picked.interval === "yearly" ? "year" : "month"}, excl. taxes` } : null;

  return (
    <SrRoot>
      <Interactions />
      <OfferTopBar />
      <Header />
      <main>
        <section className="relative overflow-hidden">
          <div className="sr-blobs" aria-hidden>
            <span className="-left-[10%] -top-[10%] h-[45vw] w-[45vw] bg-primary/15 blur-[120px]" />
            <span className="right-[0%] top-[25%] h-[35vw] w-[35vw] bg-brand-accent/15 blur-[110px]" style={{ animationDelay: "-4s" }} />
          </div>
          <div className="sr-grid-bg" aria-hidden />
          <div className="sr-container relative grid items-start gap-14 py-14 sm:py-20 lg:grid-cols-[1.05fr_520px] lg:gap-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary shadow-sm backdrop-blur">{selectedPlan ? `${selectedPlan.name} plan · ${selectedPlan.trial} free trial · No card needed` : "Free to start · No card needed"}</p>
              <h1 className="sr-h1 mt-6">
                The business that <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">runs itself.</span>
              </h1>
              <p className="sr-lead mt-5 max-w-xl">Create your workspace in a few seconds. Every product and every feature is included — pay only when your team grows.</p>

              <ul className="mt-9 grid gap-3 sm:grid-cols-2">
                {POINTS.map((p) => (
                  <li key={p.t} className="group rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                    <span className="sr-icon mb-3 h-11 w-11 rounded-xl transition-transform group-hover:scale-110"><p.icon className="h-5 w-5" /></span>
                    <p className="font-black leading-snug">{p.t}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.x}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-9 max-w-xl">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-primary">How it works</p>
                <ol className="relative space-y-4">
                  <span className="absolute bottom-3 left-[17px] top-3 w-px bg-gradient-to-b from-primary/60 to-border" aria-hidden />
                  {STEPS.map((st, i) => (
                    <li key={st.t} className="relative flex gap-4">
                      <span className="sr-circle relative z-10 h-9 w-9 flex-none text-sm font-black ring-4 ring-background">{i + 1}</span>
                      <span className="pt-0.5"><span className="block font-black leading-snug">{st.t}</span><span className="block text-sm text-muted-foreground">{st.x}</span></span>
                    </li>
                  ))}
                </ol>
              </div>

              <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Your data is kept separate from every other business&apos;s.</p>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/20 via-transparent to-brand-accent/20 blur-2xl" aria-hidden />
              <div className="rounded-[2rem] border border-border/70 bg-background p-6 shadow-[0_40px_100px_-30px] shadow-primary/30 sm:p-9">
                {mode === "closed" ? (
                  <p className="py-10 text-center text-muted-foreground">New sign-ups are paused right now. Please check back soon.</p>
                ) : (
                  <SignupForm rootDomain={platformRootDomain()} approval={mode === "approval"} selectedPlan={selectedPlan} />
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="sr-section border-t border-border/50 bg-muted/10">
          <div className="sr-container">
            <SectionHead center icon="rocket" eyebrow="Take a look" title="Your workspace," accent="ready in minutes." lead="This is the Workspace you will land in: your dashboard, every product you switch on, and your team, all in one place." />
            <Reveal><div className="mx-auto max-w-5xl"><MarketingShot screenKey="workspace" name="Workspace" /></div></Reveal>
            <ul className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
              {[{ v: "All", l: "products, every feature included" }, { v: "AI", l: "built in, to answer questions and write drafts" }, { v: "₹0", l: "to start, no card needed" }].map((x, i) => (
                <Reveal key={x.v} as="li" delay={i * 70}>
                  <div className="h-full rounded-2xl border border-border/60 bg-card p-5 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                    <p className="bg-gradient-to-br from-primary to-brand-accent bg-clip-text text-4xl font-black leading-none tracking-tight text-transparent">{x.v}</p>
                    <p className="mt-2 text-sm font-medium leading-snug text-muted-foreground">{x.l}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </SrRoot>
  );
}
