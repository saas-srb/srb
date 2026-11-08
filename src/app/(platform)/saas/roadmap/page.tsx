import { breadcrumbList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CircleSlash, Clock, Compass, MessageSquareText, Sparkles } from "lucide-react";
import { CtaBand, HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import FaqSection from "@/components/platform/saas/FaqSection";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";
import CountStats from "@/components/platform/saas/CountStats";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import ProductLogo from "@/components/products/ProductLogo";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { FEATURE_LISTS } from "@/lib/platform/saas/feature-lists";
import { productPath } from "@/lib/platform/saas/product-routes";
import { productShort } from "@/lib/platform/saas/product-short";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/roadmap", title: "Roadmap: What You Can Use Today and What Comes Next", description: "See everything SelfRun AI offers today, what we are looking into next, and how your feedback decides what we build. No made-up release dates.", keywords: ["SelfRun AI roadmap", "product roadmap", "business software roadmap", "what is new in SelfRun AI", "software release notes", "product updates"], tag: "Roadmap" });

const NAV = [
  { id: "what", label: "What this page is" },
  { id: "read", label: "How to read it" },
  { id: "now", label: "Available now" },
  { id: "recent", label: "Recently added" },
  { id: "exploring", label: "What we are exploring" },
  { id: "decide", label: "How we decide" },
  { id: "commit", label: "Our commitments" },
  { id: "constant", label: "What stays the same" },
  { id: "follow", label: "Stay informed" },
  { id: "tell", label: "Tell us" },
];

const STATES = [
  { icon: Check, tone: "emerald", name: "Available now", text: "You can open it, use it and check it today. Everything under “Available now” and “Recently added” is in this state.", where: "Taken from the live product." },
  { icon: Compass, tone: "amber", name: "Exploring", text: "An idea we are looking into because businesses ask for it. It shows where our attention is, but it is not a promise and it has no date.", where: "Listed under “What we are exploring”, never with a date." },
  { icon: CircleSlash, tone: "slate", name: "Not published", text: "Release dates, quarter-by-quarter plans and anything we have not decided yet. We do not publish these, so you are never let down by a missed date.", where: "Nothing is listed here, on purpose." },
] as const;


const RECENT = [
  { icon: "lock" as const, title: "Two-factor sign-in", text: "Add a second step when signing in, such as a code from your phone, so a stolen password alone cannot open an account.", href: "/security", cta: "Security and trust" },
  { icon: "lock" as const, title: "Forgot-password by email", text: "If you forget your password, we email you a link to set a new one. The link works once and expires after 30 minutes.", href: "/security", cta: "Security and trust" },
  { icon: "file" as const, title: "Backups, restore and deletion", text: "A clear life cycle for your data: backups, restoring from them, and deleting your business's data when you leave.", href: "/security", cta: "How data is handled" },
  { icon: "shield" as const, title: "Uploaded-file scanning", text: "Files that people upload are checked before they are accepted.", href: "/security", cta: "Security and trust" },
  { icon: "globe" as const, title: "Cookie choices on your website", text: "Visitors to your website choose first. Tracking tags load only after a visitor says yes, and their choice is recorded.", href: "/cookies", cta: "Read about cookies" },
  { icon: "users" as const, title: "Privacy requests", text: "A form where people can ask to see, correct or delete their personal information, with a reference number and a 30-day target to reply.", href: "/data-requests", cta: "Open the request form" },
  { icon: "chart" as const, title: "Live status and incident notices", text: "A public page that checks the website and database and shows any problem we are working on.", href: "/status", cta: "Open the status page" },
  { icon: "workflow" as const, title: "Automation history", text: "Automations keep a history of versions, so you can see what changed and go back to an earlier one.", href: "/products/commandos#features", cta: "See Workspace automations" },
  { icon: "check" as const, title: "Service commitments", text: "A published service level and trust pages that explain how the service is run.", href: "/sla", cta: "Read the service level" },
];

const EXPLORING = [
  { theme: "People and payroll", title: "Indian payroll deductions and forms", text: "Provident fund, state insurance and professional tax deductions, with the related tax forms, for payroll in India." },
  { theme: "People and payroll", title: "Attendance devices", text: "Bring attendance from fingerprint and similar devices into the attendance record automatically." },
  { theme: "Finance", title: "Government e-invoicing and bank links", text: "Send e-invoices to the government system and connect bank accounts for payments, to cut typing in finance." },
  { theme: "Automation", title: "A visual workflow canvas", text: "Build automations by drawing the steps on a canvas, alongside today's “when this happens, do that” workflows." },
  { theme: "AI", title: "AI that finishes a whole process", text: "Assistants that carry a process across several steps, with a person approving anything that changes records or moves money." },
  { theme: "AI", title: "Cash-flow forecasts from your own records", text: "A look ahead at your cash flow, worked out from your own records, with the working shown." },
];

const CONSTANT = [
  { icon: "layers" as const, title: "Every plan has everything", text: "Every feature is included in every plan, starting free. Nothing is held back for a higher plan." },
  { icon: "building" as const, title: "Start small, add what you need", text: "Each product works on its own, so you use what you need and nothing forces you to take the rest." },
  { icon: "lock" as const, title: "Your data stays yours", text: "One business's data is never visible to another's, and roles and permissions decide who sees what inside yours." },
  { icon: "target" as const, title: "Your brand on everything", text: "Your logo, colours, web address and apps stay yours, with SelfRun out of sight." },
  { icon: "brain" as const, title: "AI that asks permission", text: "Assistants see only what the person asking is allowed to see, and any change they suggest waits for approval." },
  { icon: "file" as const, title: "A record of what happens", text: "Sign-ins, changes and admin actions are recorded, and automatic runs are logged and explained." },
];

const FOLLOW = [
  { icon: "chart" as const, title: "Status", text: "Is everything running right now? Any open problem is shown here.", href: "/status", cta: "Open the status page" },
  { icon: "book" as const, title: "Documentation", text: "Step-by-step guides and walkthroughs for every product and feature.", href: "/docs", cta: "Read the docs" },
  { icon: "file" as const, title: "Guides and articles", text: "Practical articles on running a business with SelfRun AI.", href: "/blog", cta: "Browse the blog" },
  { icon: "shield" as const, title: "Security and trust", text: "How your data is protected, kept separate and handled.", href: "/security", cta: "Read about security" },
  { icon: "target" as const, title: "Our vision", text: "Where we are heading and why we build the way we do.", href: "/vision", cta: "Read the vision" },
  { icon: "chat" as const, title: "Talk to us", text: "Ask a question or tell us what your business needs.", href: "/contact", cta: "Contact the team" },
];

const TONES: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  amber: "bg-amber-500/10 text-amber-600 border-amber-500/25",
  slate: "bg-muted text-muted-foreground border-border",
};

const STEPS = [
  { title: "You tell us what you want to get done", text: "Describe the job and where it slows down today. A real example is worth more than the name of a feature." },
  { title: "We check it against today's product", text: "Often the need is already covered by a feature or an automation. If so, we say so and show you how." },
  { title: "We record what is missing", text: "If something really is not there, we record it as product feedback and weigh it against what other businesses ask for." },
  { title: "We announce it when it is ready", text: "A feature is described only once it exists and can be explained clearly. Until then we make no promise about when." },
];

const COMMITMENTS = [
  "No guessed release dates.",
  "Something we are exploring is never presented as a promise.",
  "If a page says something is available, it is available.",
  "Every plan includes every feature, starting free.",
  "We describe the product as it is today, not as we hope it will be.",
  "If we cannot do something yet, we tell you plainly.",
];

function Head({ id, title, lead }: { id: string; title: string; lead?: string }) {
  const n = String(NAV.findIndex((x) => x.id === id) + 1).padStart(2, "0");
  return (
    <Reveal className="mx-auto mb-12 max-w-3xl text-center">
      <p className="mb-4 flex flex-col items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-primary"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-lg tracking-normal text-white shadow-lg shadow-primary/30">{n}</span>{NAV.find((x) => x.id === id)?.label}</p>
      <h2 className="text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">{title}</h2>
      {lead && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lead}</p>}
    </Reveal>
  );
}

export default async function RoadmapPage() {
  const groups = await getFeatureGroups();

  return (
    <>
      <JsonLd data={[webPage({ type: "WebPage", path: "/roadmap", name: "Product roadmap", description: "See everything SelfRun AI offers today, what we are looking into next, and how your feedback decides what we build. No made-up release dates." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Roadmap", path: "/roadmap" }])]} />
      <PageHero
        art="features"
        eyebrow="Roadmap"
        title="What you can use today,"
        accent="and what comes next."
        lead="A roadmap should help you decide. So ours keeps two things apart: what you can use today, which we can prove, and what we are only looking into, which we never put a date on. Here is how to read it, what is available now and how you can influence what we build next."
        photo="team-desk"
        shot="workspace"
        shotName="SelfRun CommandOS"
        chip={{ title: "Products available now", text: "Taken from the live product" }}
      >
        <HeroCtas primary={{ label: "Explore the products", href: "/products" }} secondary={{ label: "Share feedback", href: "/contact" }} />
      </PageHero>

      <SectionScrollNav items={NAV} label="Roadmap sections" numbered />

      {/* 01 what */}
      <section id="what" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="what" title="A roadmap you can trust." lead="A roadmap shows where a product is today and where it is going. Many roadmaps are wish lists with dates attached. This one is not." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: "check" as const, t: "What you will find here", x: "Everything the software offers today, grouped by area of your business, with a link to each product and its guides." },
              { icon: "search" as const, t: "How to read it", x: "A clear key to what is available, what we are exploring and what we deliberately do not publish." },
              { icon: "chat" as const, t: "How to take part", x: "How we handle your feedback, and the quickest way to tell us what your business needs." },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-5 h-14 w-14 transition-transform group-hover:scale-110"><Icon name={c.icon} className="h-6 w-6" /></span>
                  <h3 className="text-xl font-black">{c.t}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{c.x}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 02 read */}
      <section id="read" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="read" title="Three states, nothing hidden." lead="Every item on a roadmap is in one of three states. Here is what each one means for you." />
          <div className="grid gap-5 lg:grid-cols-3">
            {STATES.map((s, i) => (
              <Reveal key={s.name} delay={i * 70}>
                <div className="flex h-full flex-col rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
                  <span className={`mb-5 inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-black ${TONES[s.tone]}`}><s.icon className="h-4 w-4" />{s.name}</span>
                  <p className="flex-1 leading-relaxed text-muted-foreground">{s.text}</p>
                  <p className="mt-5 border-t border-border/50 pt-4 text-sm font-bold">{s.where}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 03 now */}
      <section id="now" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="now" title="Everything available today." lead="These products are live now, and every one of them is included in every plan." />
          <Reveal><div className="mb-10 rounded-3xl border border-border/60 bg-card px-4 shadow-sm"><CountStats items={[{ v: "All", l: "products available" }, { v: "AI", l: "built into the software" }, { v: "Every", l: "area of your business" }, { v: "Free", l: "to start, every feature included" }]} /></div></Reveal>
          <div className="space-y-8">
            {groups.map((g, gi) => (
              <Reveal key={g.id} delay={(gi % 2) * 50}>
                <div className="overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-sm">
                  <div className="flex flex-wrap items-center gap-4 border-b border-border/50 bg-gradient-to-br from-primary/[0.08] via-card to-brand-accent/[0.08] px-6 py-5 sm:px-8">
                    <span className="sr-icon h-12 w-12 flex-none"><Icon name={g.icon} className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1"><h3 className="text-xl font-black">{g.title}</h3><p className="text-sm leading-snug text-muted-foreground">{g.lead}</p></div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600"><Check className="h-3.5 w-3.5" strokeWidth={3} />Available now</span>
                  </div>
                  <ul className="grid gap-4 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
                    {g.items.map((m) => {
                      const areas = (FEATURE_LISTS[m.key] ?? []).map((x) => x.title);
                      return (
                        <li key={m.key}>
                          <Link href={productPath(m.key)} className="group flex h-full flex-col gap-3 rounded-2xl border border-border/60 bg-background p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                            <span className="flex items-center gap-3"><span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-border/60 bg-card shadow-sm"><ProductLogo productKey={m.key} size={34} title={m.name} /></span><span className="min-w-0"><span className="block font-black leading-tight group-hover:text-primary">{m.name}</span><span className="block text-xs leading-snug text-muted-foreground">{productShort(m.key, m.summary)}</span></span></span>
                            {areas.length > 0 && <span className="flex flex-wrap gap-1.5">{areas.slice(0, 4).map((a) => <span key={a} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">{a}</span>)}{areas.length > 4 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">+{areas.length - 4} more</span>}</span>}
                            <span className="mt-auto flex items-center justify-between pt-1 text-sm"><span className="font-bold text-muted-foreground">Every feature included</span><span className="inline-flex items-center gap-1 font-bold text-primary">Open<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* recent */}
      <section id="recent" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="recent" title="What we have added lately." lead="Recent improvements that are live in the product now. We only list what exists, so you can check each one yourself." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {RECENT.map((r, i) => (
              <Reveal key={r.title} delay={(i % 3) * 60}>
                <Link href={r.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <div className="mb-4 flex items-center justify-between"><span className="sr-icon h-12 w-12 transition-transform group-hover:scale-110"><Icon name={r.icon} className="h-5 w-5" /></span><span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-black text-emerald-600"><Check className="h-3 w-3" strokeWidth={3.5} />Available now</span></div>
                  <h3 className="text-lg font-black leading-snug">{r.title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted-foreground">{r.text}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary">{r.cta}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* exploring */}
      <section id="exploring" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="exploring" title="Where our attention is." lead="Ideas we are looking into, shaped by what businesses ask for. They are not commitments and they have no dates. Tell us which ones matter to you and it helps us decide." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {EXPLORING.map((x, i) => (
              <Reveal key={x.title} delay={(i % 3) * 60}>
                <div className="flex h-full flex-col rounded-3xl border border-dashed border-amber-500/40 bg-gradient-to-br from-amber-500/[0.05] via-card to-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-2"><span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{x.theme}</span><span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-black text-amber-600"><Compass className="h-3 w-3" />Exploring</span></div>
                  <h3 className="text-lg font-black leading-snug">{x.title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted-foreground">{x.text}</p>
                  <Link href="/contact" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">I need this<ArrowRight className="h-4 w-4" /></Link>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-8"><p className="mx-auto max-w-3xl rounded-3xl border border-border/60 bg-card p-5 text-center text-sm leading-relaxed text-muted-foreground">An item here is something we are looking into. It is not a feature you can use yet, and it is not a promise of delivery. When something is ready, it moves to “Recently added”.</p></Reveal>
        </div>
      </section>

      {/* 04 decide */}
      <section id="decide" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="decide" title="How your feedback becomes the product." lead="Four steps, from a job you describe to something we announce only when it is real." />
          <ol className="relative mx-auto grid max-w-5xl gap-5 md:grid-cols-2">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} as="li" delay={(i % 2) * 70}>
                <div className="flex h-full gap-5 rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-brand-accent text-lg font-black text-white shadow-lg shadow-primary/25">{i + 1}</span>
                  <div><h3 className="text-lg font-black leading-snug">{s.title}</h3><p className="mt-1.5 leading-relaxed text-muted-foreground">{s.text}</p></div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 05 commit */}
      <section id="commit" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="commit" title="No dates without a dependable plan." lead="We would rather tell you less and have it be true. These are the commitments behind this page." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMMITMENTS.map((c, i) => (
              <Reveal key={c} delay={(i % 3) * 60}>
                <div className="flex h-full gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-sm"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-white"><Check className="h-4 w-4" strokeWidth={3.5} /></span><p className="font-bold leading-snug">{c}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* constant */}
      <section id="constant" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="constant" title="What will not change." lead="Whatever we add next, these stay true. They are the base you can plan your business on." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {CONSTANT.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 60}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-4 h-12 w-12 transition-transform group-hover:scale-110"><Icon name={c.icon} className="h-5 w-5" /></span>
                  <h3 className="text-lg font-black leading-snug">{c.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{c.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* follow */}
      <section id="follow" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="follow" title="Where to keep up." lead="The places that always show the current state of the product, in one list." />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FOLLOW.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 60}>
                <Link href={f.href} className="group flex h-full gap-4 rounded-3xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                  <span className="sr-icon h-12 w-12 flex-none"><Icon name={f.icon} className="h-5 w-5" /></span>
                  <span><span className="block font-black">{f.title}</span><span className="block text-sm leading-snug text-muted-foreground">{f.text}</span><span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary">{f.cta}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 06 tell */}
      <section id="tell" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="tell" title="Tell us what your business needs." lead="The most useful feedback is a real example from your day. A few lines are enough." />
          <Reveal>
            <div className="relative mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-brand-accent text-white shadow-2xl shadow-primary/25 lg:grid-cols-[1.1fr_1fr]">
              <Sparkles className="absolute -right-4 -top-4 h-40 w-40 text-white/10" aria-hidden />
              <div className="relative p-8 sm:p-10">
                <h3 className="text-2xl font-black leading-snug sm:text-3xl">Send product feedback</h3>
                <p className="mt-3 leading-relaxed text-white/85">We can show you how today&apos;s product already handles it, and record anything that is really missing. We will not promise a delivery date for something that has not been announced.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-primary shadow-lg transition-transform hover:-translate-y-0.5">Send feedback <MessageSquareText className="h-4 w-4" /></Link>
                  <Link href="/products" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">Browse what exists</Link>
                </div>
              </div>
              <div className="relative border-t border-white/20 bg-white/10 p-8 sm:p-10 lg:border-l lg:border-t-0">
                <p className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/80"><Clock className="h-4 w-4" />Helpful to include</p>
                <ul className="space-y-3">
                  {["What you are trying to get done", "Who on your team does it today", "Where it slows down or goes wrong", "Which app or spreadsheet you use for it now"].map((x) => <li key={x} className="flex gap-3 font-semibold"><Check className="mt-0.5 h-5 w-5 flex-none" strokeWidth={3} />{x}</li>)}
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand title="Use what is available today, free." lead="Every feature is included in every plan. Start free, no card needed." />
      <FaqSection
        topics={["General", "Data & security"]}
        limit={4}
        title="Questions about"
        accent="the roadmap."
        lead="What the roadmap shows, what it leaves out and how you can influence it."
        extra={[
          { q: "What is the roadmap?", a: "A public page that shows what SelfRun AI offers today and how we handle what comes next. It lists what is available now and explains how feedback is handled, but it does not publish dated plans." },
          { q: "What does “Exploring” mean?", a: "It is an idea we are looking into because businesses ask for it. It is not a feature you can use today and it is not a promise to deliver, so it never has a date." },
          { q: "Why are there no release dates?", a: "Because a date we cannot reliably keep helps nobody. We announce a feature when it is ready to be described clearly." },
          { q: "How do I ask for a feature?", a: "Use the contact form and describe the job you want to make easier. We will show you how the current product handles it and record anything that is missing." },
        ]}
      />
    </>
  );
}
