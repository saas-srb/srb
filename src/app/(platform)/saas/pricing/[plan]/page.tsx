import { breadcrumbList, planOffers, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  FileText,
  Globe,
  HardDrive,
  Headphones,
  KeyRound,
  Laptop,
  Layers,
  LifeBuoy,
  Lock,
  Minus,
  Monitor,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import { getStandardPlans } from "@/lib/platform/billing/plans";
import { buildShowcase } from "@/lib/platform/billing/showcase";
import { formatMoney } from "@/lib/platform/billing/types";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { CtaBand, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import FaqSection from "@/components/platform/saas/FaqSection";
import Reveal from "@/components/platform/saas/Reveal";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { signupPlanHref, trialLabel } from "@/lib/platform/billing/signup-plan-rule";
import { productPath, SAAS_PRODUCT_COUNT } from "@/lib/platform/saas/product-routes";
import ProductLogo from "@/components/products/ProductLogo";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const days = await getBillingSettings().then((s) => s.billing.defaultTrialDays).catch(() => 30);
  const plans = buildShowcase(await getStandardPlans().catch(() => []), days).filter((p) => p.id !== "enterprise");
  const i = plans.findIndex((p) => p.id === id);
  return i < 0 ? null : { plan: plans[i], plans, prev: plans[i - 1] ?? null, next: plans[i + 1] ?? null };
}

export async function generateMetadata({ params }: { params: Promise<{ plan: string }> }): Promise<Metadata> {
  const d = await load((await params).plan);
  return d
    ? pageMeta({
        path: `/pricing/${d.plan.id}`,
        title: `${d.plan.name} Plan: Complete Specifications, Apps & Allowances`,
        description: `${d.plan.name} Plan details: All ${SAAS_PRODUCT_COUNT} products, native mobile & desktop apps, generous resource quotas, and enterprise-grade security.`,
        keywords: [
          `${d.plan.name} plan`,
          `${d.plan.name} plan pricing`,
          "business software plan",
          "Android app",
          "iOS app",
          "Windows app",
          "macOS app",
          "Linux app",
          "PWA",
          "SaaS plan comparison",
          "business software features",
        ],
        tag: "Pricing",
      })
    : {};
}

interface AppPlatform {
  name: string;
  category: string;
  tagline: string;
  icon: typeof Smartphone;
  compatibility: string;
  badge: string;
  features: string[];
}

const SUPPORTED_APPS: AppPlatform[] = [
  {
    name: "Android App",
    category: "Mobile & Tablet",
    tagline: "Dedicated native application for Android smartphones, tablets & foldables.",
    icon: Smartphone,
    compatibility: "Android 9.0 and above",
    badge: "Native APK & Play Store",
    features: [
      "Offline sync with auto-upload when reconnected",
      "Camera-based smart receipt & document OCR scanning",
      "Instant push notifications for approvals & messages",
      "Biometric fingerprint & face recognition unlock",
    ],
  },
  {
    name: "iOS App",
    category: "iPhone & iPad",
    tagline: "Fluid, native iOS experience designed specifically for Apple devices.",
    icon: Smartphone,
    compatibility: "iOS 15.0 and above",
    badge: "Native Apple App",
    features: [
      "FaceID and TouchID biometric authentication",
      "Interactive home screen & lock screen widgets",
      "Native Apple push alerts & badge counters",
      "Split View and Stage Manager support on iPadOS",
    ],
  },
  {
    name: "PWA (Progressive Web App)",
    category: "Universal Web",
    tagline: "Install directly from any modern web browser with zero app store friction.",
    icon: Globe,
    compatibility: "Chrome, Safari, Edge, Firefox, Brave",
    badge: "Zero-Install Footprint",
    features: [
      "Installable on mobile and desktop with a single tap",
      "Silent background caching & seamless auto-updates",
      "Ultra-low storage impact (under 15 MB)",
      "Full offline mode with service worker caching",
    ],
  },
  {
    name: "Windows Desktop App",
    category: "Desktop Workstation",
    tagline: "Heavy-duty native desktop client engineered for fast business workflows.",
    icon: Monitor,
    compatibility: "Windows 10 & 11 (64-bit & ARM)",
    badge: "Native Windows Executable",
    features: [
      "System tray background sync & notification badges",
      "Global hotkeys & keyboard-first navigation shortcuts",
      "Multi-window support for side-by-side multitasking",
      "Local file system export & automated silent updates",
    ],
  },
  {
    name: "macOS Desktop App",
    category: "Mac Workstation",
    tagline: "High-performance Mac application optimized for Apple Silicon and Intel.",
    icon: Laptop,
    compatibility: "macOS Monterey, Ventura, Sonoma, Sequoia",
    badge: "Universal Binary",
    features: [
      "Full Apple Silicon (M1/M2/M3/M4) native optimization",
      "Menu bar quick actions & menu bar mini-dashboard",
      "System Dark / Light mode auto-switching",
      "Seamless drag-and-drop file imports from Finder",
    ],
  },
  {
    name: "Linux Desktop App",
    category: "Developer & Workstation",
    tagline: "Fast, dependable native build tailored for Linux desktop environments.",
    icon: Terminal,
    compatibility: "Ubuntu, Debian, Fedora, Arch (AppImage, deb, rpm)",
    badge: "Native Linux Package",
    features: [
      "Distribution-agnostic AppImage and deb/rpm packages",
      "Minimal RAM and CPU resource consumption",
      "Wayland and X11 native desktop support",
      "Command-line launch arguments & developer shortcuts",
    ],
  },
  {
    name: "Cloud Web Workspace",
    category: "Browser Anywhere",
    tagline: "Full-fidelity web platform accessible instantly without any software install.",
    icon: Globe,
    compatibility: "Any modern web browser on any OS",
    badge: "Always Up-To-Date",
    features: [
      "Log in from any device anywhere in the world",
      "100% feature parity with desktop installations",
      "Encrypted end-to-end sessions with auto-lock",
      "Zero local storage footprint or maintenance needed",
    ],
  },
];

const PLATFORM_INFRASTRUCTURE = [
  {
    title: "Multi-Tenant Data Isolation",
    icon: ShieldCheck,
    desc: "Strict logical and database partitions guarantee your business data never mingles with any other company.",
  },
  {
    title: "Custom Domain & Auto SSL",
    icon: Globe,
    desc: "Map your own domain (e.g. portal.yourcompany.com) with automated zero-touch SSL certificate provisioning and renewal.",
  },
  {
    title: "White-Label Brand Identity",
    icon: Sparkles,
    desc: "Upload your custom logo, favicon, brand palette, and invoice themes across all employee and client views.",
  },
  {
    title: "Full REST API & Webhooks",
    icon: Terminal,
    desc: "Automate anything with secure API access keys, custom rate limits, and real-time event webhooks.",
  },
  {
    title: "Role-Based Permissions (RBAC)",
    icon: KeyRound,
    desc: "Fine-grained permissions for Directors, Managers, Staff, and Accountants to control exact view and edit capabilities.",
  },
  {
    title: "Complete Activity Audit Trail",
    icon: FileText,
    desc: "Immutable logs tracking user sign-ins, IP addresses, data creations, edits, and deletions with exact timestamps.",
  },
  {
    title: "Enterprise-Grade Encryption",
    icon: Lock,
    desc: "Military-grade 256-bit TLS encryption in transit and AES-256 encrypted storage at rest for all database entries.",
  },
  {
    title: "Automated Daily Backups",
    icon: RefreshCw,
    desc: "Redundant daily cloud backups with one-click full data exports in JSON, CSV, and PDF anytime.",
  },
];

export default async function PlanDetailPage({ params }: { params: Promise<{ plan: string }> }) {
  const d = await load((await params).plan);
  if (!d) notFound();
  const { plan, plans, prev, next } = d;
  const modules = await getFeatureModules();
  const monthly = plan.kind === "paid" ? plan.offer.monthly : null;
  const yearly = plan.kind === "paid" ? plan.offer.yearly : null;

  // Plan tier specific attributes
  const isFree = plan.kind === "free";
  const seatsLabel = plan.seats ? `Up to ${plan.seats.toLocaleString("en-IN")} team members` : "Unlimited team members";
  const deviceSessionLabel = isFree ? "1 active device login at a time" : "Unlimited simultaneous device logins";
  const supportLevel = isFree
    ? "Community documentation, step-by-step guides & help desk"
    : plan.id === "starter"
      ? "Standard priority email & ticketing support (response within 24h)"
      : plan.id === "growth"
        ? "Priority email, live chat & WhatsApp support (response within 4h)"
        : "Dedicated account manager, 1-on-1 onboarding & priority phone support";
  const slaLevel = isFree ? "Standard high availability" : plan.id === "starter" ? "99.5% Uptime SLA" : plan.id === "growth" ? "99.9% Uptime SLA" : "99.95% High-Availability Enterprise SLA";

  const ctaLabel = isFree ? "Start free forever" : plan.trialDays > 0 ? `Try ${plan.name} free for ${trialLabel(plan.trialDays)}` : `Get ${plan.name}`;
  const ctaHref = isFree ? "/signup" : signupPlanHref(plan.id, "monthly");

  return (
    <>
      <JsonLd
        data={[
          webPage({ path: `/pricing/${plan.id}`, name: `${plan.name} plan`, description: plan.description }),
          breadcrumbList([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
            { name: `${plan.name} plan`, path: `/pricing/${plan.id}` },
          ]),
          planOffers([
            {
              id: plan.id,
              name: plan.name,
              description: plan.description,
              currency: plan.currency,
              kind: plan.kind,
              monthly: plan.offer.monthly,
              validUntil: null,
            },
          ]),
        ]}
      />

      <PageHero
        art={`plan-${plan.id}`}
        eyebrow={`${plan.name} plan specifications`}
        title={`${plan.name}.`}
        accent={isFree ? "Free, for life." : "Everything included, built to scale."}
        lead={plan.description}
        photo="analytics"
        shot="workspace"
        shotName="SelfRun Workspace"
        chip={{ title: `All ${SAAS_PRODUCT_COUNT} products included`, text: "Zero locked features" }}
      >
        <HeroCtas
          primary={{ label: ctaLabel, href: ctaHref }}
          secondary={{ label: "Compare all plans", href: "/pricing" }}
        />
      </PageHero>

      {/* SECTION 1: Plan At A Glance & Live Limits */}
      <section className="sr-section">
        <div className="sr-container">
          <Link href="/pricing" className="sr-link mb-8 inline-flex items-center gap-2 font-bold text-primary">
            <ArrowLeft className="h-4 w-4" /> Back to all plans
          </Link>
          <SectionHead
            icon="wallet"
            eyebrow="Pricing & Quotas"
            title={`${plan.name} plan`}
            accent="at a glance."
            lead="No hidden tiers or secret extras. Here is the exact capacity, billing, and resource limit included in this plan."
          />

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Price Card Highlight */}
            <Reveal className="lg:col-span-1">
              <div className="sr-band flex h-full flex-col justify-between rounded-[2.5rem] p-8 text-white shadow-2xl shadow-primary/30">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
                      <Sparkles className="h-3.5 w-3.5" /> Plan Overview
                    </span>
                    {plan.popular && (
                      <span className="rounded-full bg-emerald-400 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-black">
                        Most Popular
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-3xl font-black">{plan.name}</h3>
                    <p className="mt-1 text-sm text-white/80">{plan.description}</p>
                  </div>

                  <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/20">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/70">Subscription Fee</p>
                    {isFree ? (
                      <p className="mt-1 flex items-baseline gap-2">
                        <span className="text-5xl font-black">{formatMoney(0, plan.currency)}</span>
                        <span className="text-base font-semibold text-white/70">forever</span>
                      </p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        <p className="flex items-baseline gap-2">
                          <span className="text-5xl font-black">{monthly != null ? formatMoney(monthly, plan.currency) : "—"}</span>
                          <span className="text-base font-semibold text-white/70">/ month</span>
                        </p>
                        {yearly != null && (
                          <p className="text-xs font-medium text-emerald-300">
                            or {formatMoney(yearly, plan.currency)} billed annually (Save 2 months free)
                          </p>
                        )}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-white/60">Prices exclude applicable local taxes & GST.</p>
                  </div>

                  <div className="space-y-3 rounded-2xl bg-white/5 p-5 text-sm ring-1 ring-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-white/75">Team Capacity:</span>
                      <span className="font-black text-white">{plan.seats ? `Up to ${plan.seats.toLocaleString("en-IN")} Users` : "Unlimited Users"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/75">Device Logins:</span>
                      <span className="font-semibold text-white">{isFree ? "1 Device" : "Unlimited Devices"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/75">All 18 Products:</span>
                      <span className="font-black text-emerald-300">100% Included</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/75">SLA Uptime:</span>
                      <span className="font-semibold text-white">{slaLevel.replace(" Enterprise SLA", "").replace(" SLA", "")}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  <Link
                    href={ctaHref}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-sm font-black text-black shadow-xl transition-all hover:scale-[1.02] hover:bg-white/90"
                  >
                    {ctaLabel} <ArrowRight className="h-4 w-4" />
                  </Link>
                  {plan.trialDays > 0 && (
                    <p className="text-center text-xs text-white/70">No credit card required to start free trial · Cancel anytime</p>
                  )}
                </div>
              </div>
            </Reveal>

            {/* Resource Limit Specs */}
            <Reveal delay={100} className="lg:col-span-2">
              <div className="flex h-full flex-col justify-between rounded-[2.5rem] border border-border/60 bg-card p-8 shadow-sm">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-5">
                    <div>
                      <h3 className="text-xl font-black">Monthly Resource Allowances</h3>
                      <p className="text-xs text-muted-foreground">Every allowance included in your {plan.name} workspace quota.</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                      <BadgeCheck className="h-4 w-4" /> Generous Base Quotas
                    </span>
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {plan.limits.map((l) => (
                      <div key={l.key} className="flex flex-col justify-between rounded-2xl border border-border/60 bg-muted/20 p-5 transition-colors hover:border-primary/40">
                        <div className="flex items-start justify-between">
                          <span className="text-sm font-semibold text-muted-foreground">{l.label}</span>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-primary/80">{l.short}</span>
                        </div>
                        <div className="mt-3">
                          <p className="text-2xl font-black tracking-tight text-foreground">
                            {l.included ? l.value : <span className="text-muted-foreground">{l.value}</span>}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {l.key === "aiTokensPerMonth"
                              ? "Generative copy, invoice reading, reports & assistants"
                              : l.key === "storageMb"
                                ? "Document uploads, media, attachments & backups"
                                : l.key === "emailsPerMonth"
                                  ? "Transactional bills, quotes & customer notifications"
                                  : l.key === "voiceMinutesPerMonth"
                                    ? "Customer calling, IVR menus & phone orders"
                                    : "Custom web domains with free automated SSL"}
                          </p>
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-col justify-between rounded-2xl border border-border/60 bg-muted/20 p-5">
                      <span className="text-sm font-semibold text-muted-foreground">Concurrent Device Sessions</span>
                      <div className="mt-3">
                        <p className="text-2xl font-black tracking-tight text-foreground">{deviceSessionLabel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Switch between phone, laptop, and desktop without signing out.</p>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between rounded-2xl border border-border/60 bg-muted/20 p-5">
                      <span className="text-sm font-semibold text-muted-foreground">Team Member Seats</span>
                      <div className="mt-3">
                        <p className="text-2xl font-black tracking-tight text-foreground">{seatsLabel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Role-based controls across managers, staff & accountants.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary/5 p-4 text-xs font-semibold text-primary">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Need more allowance later?
                  </span>
                  <span className="text-muted-foreground">You can move to the next plan instantly with zero downtime.</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* SECTION 2: Multi-Platform Apps Ecosystem (Exact request: Android, iOS, Windows, macOS, Linux, PWA) */}
      <section className="sr-section bg-muted/10">
        <div className="sr-container">
          <SectionHead
            icon="rocket"
            eyebrow="Multi-Platform Access"
            title="Native Apps on Every Screen,"
            accent="included in your plan."
            lead={`Your ${plan.name} plan gives your entire team access to native apps across all major operating systems. Work from your phone, laptop, workstation, or browser seamlessly.`}
          />

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SUPPORTED_APPS.map((app, i) => {
              const AppIcon = app.icon;
              return (
                <Reveal key={app.name} delay={i * 60}>
                  <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border/60 bg-primary/10 text-primary transition-transform group-hover:scale-110">
                          <AppIcon className="h-6 w-6" />
                        </span>
                        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-emerald-600">
                          {app.badge}
                        </span>
                      </div>

                      <div className="mt-5">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{app.category}</span>
                        <h4 className="mt-1 text-xl font-black text-foreground">{app.name}</h4>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{app.tagline}</p>
                      </div>

                      <div className="mt-5 border-t border-border/60 pt-4">
                        <p className="text-xs font-bold uppercase tracking-wider text-primary">Key Capabilities</p>
                        <ul className="mt-2.5 space-y-2 text-xs text-muted-foreground">
                          {app.features.map((f) => (
                            <li key={f} className="flex items-start gap-2">
                              <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-emerald-500" strokeWidth={3} />
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-6 rounded-xl bg-muted/40 px-3.5 py-2 text-[11px] font-medium text-muted-foreground">
                      Compatible: <span className="font-semibold text-foreground">{app.compatibility}</span>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={200} className="mt-8">
            <div className="flex flex-col items-center justify-between gap-4 rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-brand-accent/10 p-6 sm:flex-row">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
                  <RefreshCw className="h-6 w-6" />
                </span>
                <div>
                  <h4 className="font-black text-foreground">Real-Time Cloud Synchronization</h4>
                  <p className="text-xs text-muted-foreground">
                    Edits made on your phone or desktop reflect instantly on all connected devices with zero latency.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-black text-white shadow-md">
                <Check className="h-3.5 w-3.5" /> Synchronized Everywhere
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* SECTION 3: Enterprise Platform Infrastructure & Governance */}
      <section className="sr-section">
        <div className="sr-container">
          <SectionHead
            icon="shield"
            eyebrow="Platform Capabilities"
            title="Enterprise Foundation,"
            accent="standard on your workspace."
            lead={`Every workspace on ${plan.name} is powered by our hardened multi-tenant architecture with uncompromising data protection and developer toolkits.`}
          />

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_INFRASTRUCTURE.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <Reveal key={item.title} delay={idx * 50}>
                  <div className="flex h-full flex-col justify-between rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                    <div>
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <IconComp className="h-5 w-5" />
                      </span>
                      <h4 className="mt-4 font-black leading-snug text-foreground">{item.title}</h4>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 border-t border-border/50 pt-3 text-[11px] font-bold text-emerald-600">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} /> Included in {plan.name}
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 4: Service Level & Customer Support */}
      <section className="sr-section bg-muted/10">
        <div className="sr-container">
          <SectionHead
            icon="check"
            eyebrow="Support & Reliability"
            title="Dedicated Support & SLA"
            accent="you can depend on."
            lead="Your business operations run continuously. Here is the commitment and service level tied directly to your subscription."
          />

          <div className="grid gap-6 md:grid-cols-3">
            <Reveal delay={0}>
              <div className="flex h-full flex-col justify-between rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
                <div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Headphones className="h-6 w-6" />
                  </span>
                  <h4 className="mt-5 text-lg font-black text-foreground">Customer Support Tier</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{supportLevel}</p>
                </div>
                <div className="mt-6 rounded-2xl bg-muted/30 p-4 text-xs font-semibold text-foreground">
                  Channels: {isFree ? "Help Center & Documentation" : plan.id === "starter" ? "Email & Ticketing" : plan.id === "growth" ? "Email, Chat & WhatsApp" : "Priority Phone, WhatsApp & Dedicated Rep"}
                </div>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div className="flex h-full flex-col justify-between rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
                <div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                    <Server className="h-6 w-6" />
                  </span>
                  <h4 className="mt-5 text-lg font-black text-foreground">Uptime Guarantee (SLA)</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{slaLevel}</p>
                </div>
                <div className="mt-6 rounded-2xl bg-muted/30 p-4 text-xs font-semibold text-foreground">
                  Status: <span className="font-bold text-emerald-600">24/7 Monitored Infrastructure</span>
                </div>
              </div>
            </Reveal>

            <Reveal delay={160}>
              <div className="flex h-full flex-col justify-between rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
                <div>
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <RefreshCw className="h-6 w-6" />
                  </span>
                  <h4 className="mt-5 text-lg font-black text-foreground">Data Backups & Export</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Automated encrypted backups stored with geo-redundancy. Export your complete business data in open formats anytime.
                  </p>
                </div>
                <div className="mt-6 rounded-2xl bg-muted/30 p-4 text-xs font-semibold text-foreground">
                  Format: <span className="font-bold">JSON, CSV & Full PDF Archive</span>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* SECTION 5: All 18 Products Included */}
      <section className="sr-section">
        <div className="sr-container">
          <SectionHead
            center
            icon="layers"
            eyebrow="Included Software Products"
            title={`Every Single Product in ${plan.name},`}
            accent="unlocked from day one."
            lead="We do not lock products behind pricier tiers. Open any product below to explore its real workflow screens."
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((m, i) => (
              <Reveal key={m.key} delay={(i % 4) * 50}>
                <Link
                  href={productPath(m.key)}
                  className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
                >
                  <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background shadow-sm transition-transform group-hover:scale-110">
                        <ProductLogo productKey={m.key} size={28} title={m.name} />
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-600">
                        <Check className="h-3 w-3" strokeWidth={3.5} /> Included
                      </span>
                    </div>
                    <h4 className="mt-3 font-black leading-tight text-foreground transition-colors group-hover:text-primary">
                      {m.name.replace(/^SelfRun\s+/i, "")}
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.description}</p>
                  </div>
                  <span className="mt-4 inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-primary">
                    Explore product <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 6: Plan Navigation / Next Step */}
      <section className="sr-section bg-muted/10 pb-0">
        <div className="sr-container max-w-4xl">
          <SectionHead
            center
            eyebrow="Explore Other Tiers"
            title="Compare with"
            accent="other plans."
            lead="Pick the team size and resource quota that matches your organization today."
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              { p: prev, d: "Previous Tier" },
              { p: next, d: "Next Tier" },
            ].map(({ p, d: dir }) =>
              p ? (
                <Link
                  key={dir}
                  href={`/pricing/${p.id}`}
                  className="group flex items-center justify-between rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">{dir}</span>
                    <span className="mt-1 block text-2xl font-black text-foreground group-hover:text-primary transition-colors">
                      {p.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{p.seats ? `Up to ${p.seats} users` : "Unlimited users"}</span>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:translate-x-1">
                    <ArrowRight className="h-5 w-5" />
                  </span>
                </Link>
              ) : null,
            )}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Want to see the entire allowance table?{" "}
            <Link href="/pricing" className="font-bold text-primary hover:underline">
              View side-by-side comparison table
            </Link>
          </p>
        </div>
      </section>

      <CtaBand />
      <FaqSection
        topics={["Plans & pricing", "Data & security"]}
        limit={6}
        title="Frequently asked about"
        accent={`${plan.name}.`}
        lead="Everything you need to know about switching plans, billing cycles, cancellation, and allowances."
      />
    </>
  );
}
