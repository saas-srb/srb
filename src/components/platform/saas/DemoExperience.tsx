import Link from "next/link";
import { ArrowRight, Globe2, KeyRound, LayoutDashboard, LockKeyhole, Sparkles } from "lucide-react";
import CopyDemoValue from "@/components/platform/saas/CopyDemoValue";
import { Blobs, SectionHead } from "@/components/platform/saas/blocks";
import Reveal from "@/components/platform/saas/Reveal";
import { DEMO_ACCESS } from "@/components/platform/saas/demo-access";
import { DemoWorkspaceCta, DemoWindowHost, DemoWorkspaceLink, DemoWebsiteLink } from "@/components/platform/saas/DemoLinks";

/** The system's gradient edge glow that blooms behind a card on hover (FeatureGrid pattern). */
function Glow() {
  return <span className="pointer-events-none absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-primary/25 via-primary/0 to-brand-accent/25 opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-100" aria-hidden />;
}

export default function DemoExperience() {
  return (
    <section id="self-guided-demo" className="sr-section relative overflow-hidden bg-muted/10" style={{ scrollMarginTop: 140 }}>
      <Blobs />
      <div className="sr-grid-bg" aria-hidden />
      <div className="sr-container relative">
        <Reveal>
          <SectionHead n="01" icon="layers" eyebrow="Self-guided product tour" title="Try it for yourself" accent="in seconds." lead="No signup required. Open the live workspace with the shared demo credentials, or preview the public site first." />
        </Reveal>

        {/* Primary live demo card */}
        <Reveal delay={80} className="group relative">
          <Glow />
          <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm transition-all duration-500 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/10 sm:p-8 lg:p-10">
            <span className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-[120px]" aria-hidden />
            <span className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-brand-accent/10 blur-[120px]" aria-hidden />

            <div className="relative grid gap-8 lg:grid-cols-[1fr_minmax(0,1fr)] lg:items-start lg:gap-12">
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="sr-chip"><Sparkles className="h-3.5 w-3.5" />Recommended</span>
                  <span className="sr-chip">No signup required</span>
                </div>
                <h3 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Open the live demo workspace</h3>
                <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
                  Jump straight into the actual product. Sign in with the shared demo account to explore every module, workflow, and connected experience as if it were yours.
                </p>

                <DemoWorkspaceCta />

                <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <LockKeyhole className="h-3.5 w-3.5 text-primary" />
                    Shared demo access • safe to explore
                  </span>
                  <span className="hidden sm:inline">•</span>
                  <span>Works in any modern browser</span>
                </div>
              </div>

              <div className="sr-window self-start">
                <div className="sr-window-bar" aria-hidden>
                  <span className="sr-dot" />
                  <span className="sr-dot" />
                  <span className="sr-dot" />
                  <DemoWindowHost />
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex items-start gap-3">
                    <span className="sr-icon mt-0.5 shrink-0">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">Demo credentials</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Copy and paste these when signing in</p>
                    </div>
                  </div>

                  <Credential label="Email" value={DEMO_ACCESS.email} />
                  <Credential label="Password" value={DEMO_ACCESS.password} />

                  <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-muted-foreground">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15">
                      <LockKeyhole className="h-3 w-3 text-amber-600" />
                    </span>
                    <p>Please don't save personal data or change account/security settings.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Two paths side by side */}
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Reveal delay={160} className="group relative h-full">
            <Glow />
            <div className="relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm transition-all duration-500 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/10 sm:p-7">
              <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" aria-hidden />
              <span className="sr-icon mb-5">
                <LayoutDashboard className="h-5 w-5" />
              </span>
              <p className="sr-eyebrow">Path 1 • Live experience</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">Explore the actual workspace</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                See connected business modules, approvals, and automation working together in the real product.
              </p>
              <DemoWorkspaceLink />
            </div>
          </Reveal>

          <Reveal delay={240} className="group relative h-full">
            <Glow />
            <div className="relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card p-6 shadow-sm transition-all duration-500 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-xl group-hover:shadow-primary/10 sm:p-7">
              <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-accent/10 blur-3xl" aria-hidden />
              <span className="sr-icon mb-5">
                <Globe2 className="h-5 w-5" />
              </span>
              <p className="sr-eyebrow">Path 2 • Quick preview</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">See the public website first</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                Get oriented with the demo company's public presence before diving into the interactive workspace.
              </p>
              <DemoWebsiteLink />
            </div>
          </Reveal>
        </div>

        <Reveal delay={320} className="mt-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary/[0.04] p-5 transition-colors sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">Want a walkthrough tailored to your business?</p>
              <p className="mt-1 text-sm text-muted-foreground">We'll map the product to your actual processes and answer your specific questions.</p>
            </div>
            <Link href="/contact" className="sr-link">
              Talk to our team
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Credential({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <code className="mt-1 block break-all text-sm font-semibold">{value}</code>
      </div>
      <CopyDemoValue value={value} />
    </div>
  );
}
