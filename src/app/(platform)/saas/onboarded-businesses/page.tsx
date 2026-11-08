import { breadcrumbList, howTo, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, FileSpreadsheet, LockKeyhole, MessageCircle, Sparkles } from "lucide-react";
import { CtaBand, HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import FaqSection from "@/components/platform/saas/FaqSection";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import ProductLogo from "@/components/products/ProductLogo";
import { INDUSTRIES } from "@/lib/platform/saas/content";
import { GROWTH, STORIES, YOUR_BRAND } from "@/lib/platform/saas/site";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { productPath } from "@/lib/platform/saas/product-routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/onboarded-businesses", title: "Get Your Business Set Up in Minutes", description: "How a business starts on SelfRun AI: create a workspace, add your brand, invite your team, choose your products and bring your data. Free to start, no card needed.", keywords: ["business software onboarding", "set up company workspace", "how to onboard business to software", "free business workspace", "import leads and employees from CSV", "business software setup guide", "start using CRM and HR software"], tag: "Onboarding" });

const NAV = [
  { id: "what", label: "What getting set up means" },
  { id: "day1", label: "Your first day" },
  { id: "get", label: "What you get" },
  { id: "path", label: "Your first year" },
  { id: "who", label: "Who starts here" },
  { id: "products", label: "Choose products" },
  { id: "data", label: "Bring your data" },
  { id: "help", label: "Help along the way" },
  { id: "privacy", label: "Privacy" },
  { id: "featured", label: "Be featured" },
];

function Head({ id, title, accent, lead }: { id: string; title: string; accent?: string; lead?: string }) {
  const n = String(NAV.findIndex((x) => x.id === id) + 1).padStart(2, "0");
  return (
    <Reveal className="mx-auto mb-12 max-w-3xl text-center">
      <p className="mb-4 flex flex-col items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-primary"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-lg tracking-normal text-white shadow-lg shadow-primary/30">{n}</span>{NAV.find((x) => x.id === id)?.label}</p>
      <h2 className="text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">{title}{accent && <> <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">{accent}</span></>}</h2>
      {lead && <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lead}</p>}
    </Reveal>
  );
}

export default async function OnboardedBusinessesPage() {
  const groups = await getFeatureGroups();
  const first = GROWTH[0];

  return (
    <>
      <JsonLd data={[webPage({ type: "WebPage", path: "/onboarded-businesses", name: "Getting started", description: "How a business starts on SelfRun AI: create a workspace, add your brand, invite your team, choose your products and bring your data. Free to start, no card needed." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Getting started", path: "/onboarded-businesses" }]), howTo({ path: "/onboarded-businesses", name: "How to get your business set up on SelfRun AI", description: first.goal, steps: first.actions.map((a, i) => ({ name: `Step ${i + 1}`, text: a })) })]} />
      <PageHero
        art="features"
        eyebrow="Getting started"
        title="A workspace built"
        accent="around your business."
        lead="Every business sets up its own workspace, team access and brand, and starts free in minutes. There is nothing to install and no card is needed. Customer names and account details are private, so we publish a list of businesses only when a business has clearly agreed to be featured."
        photo="open-office"
        shot="workspace"
        shotName="SelfRun CommandOS"
        chip={{ title: "Start free, no card needed", text: "Every product in every plan" }}
      >
        <HeroCtas primary={{ label: "Create a workspace", href: "/signup" }} secondary={{ label: "Read the setup guide", href: "/docs/getting-started" }} />
      </PageHero>

      <SectionScrollNav items={NAV} label="Onboarding sections" numbered />

      {/* 01 what */}
      <section id="what" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="what" title="Getting set up is" accent="something you do yourself." lead="There is no sales queue and no long setup project. You register, shape the workspace to your business and switch on what you need, all in one sitting if you like." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: "building" as const, t: "Your business's workspace", x: "Register and name your business. The workspace carries your name and logo from the first screen." },
              { icon: "users" as const, t: "Your team, with the right access", x: "Invite people and give each a role, so everyone sees only what their job needs." },
              { icon: "layers" as const, t: "Only the products you choose", x: "Switch on the products that fit today and add more whenever you need them." },
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

      {/* 02 day 1 */}
      <section id="day1" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="day1" title="What your first day" accent="looks like." lead={first.goal} />
          <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[1.2fr_1fr]">
            <Reveal>
              <ol className="h-full space-y-4 rounded-3xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
                {first.actions.map((a, i) => (
                  <li key={a} className="flex gap-4"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-sm font-black text-white shadow-md shadow-primary/25">{i + 1}</span><p className="pt-2 leading-snug">{a}</p></li>
                ))}
              </ol>
            </Reveal>
            <Reveal delay={80}>
              <div className="h-full rounded-3xl border border-emerald-500/25 bg-emerald-500/[0.07] p-6 sm:p-8">
                <p className="text-xs font-black uppercase tracking-widest text-emerald-600">By the end of day one</p>
                <ul className="mt-4 space-y-3">{first.outcomes.map((o) => <li key={o} className="flex gap-3 font-bold leading-snug"><Check className="mt-0.5 h-5 w-5 flex-none text-emerald-600" strokeWidth={3} />{o}</li>)}</ul>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-rose-500/[0.08] p-3"><p className="text-[11px] font-black uppercase tracking-widest text-rose-500">Before</p><p className="mt-1 text-sm leading-snug">{first.before}</p></div>
                  <div className="rounded-2xl bg-background p-3"><p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">After</p><p className="mt-1 text-sm leading-snug">{first.after}</p></div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 03 what you get */}
      <section id="get" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="get" title="What you get" accent="from the start." lead="Every business gets the same complete software. There is no smaller version for smaller businesses." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {YOUR_BRAND.slice(0, 6).map((b, i) => (
              <Reveal key={b.key} delay={(i % 3) * 60}>
                <div className="flex h-full gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-sm"><span className="sr-icon h-12 w-12 flex-none"><Icon name={b.icon} className="h-5 w-5" /></span><span><span className="block font-black leading-snug">{b.title}</span><span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{b.text}</span></span></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 04 path */}
      <section id="path" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="path" title="From day one to" accent="a business that runs itself." lead="A suggested path, not a rule. Switch on a few products at each stage and leave the rest until you need them." />
          <ol className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GROWTH.map((p, i) => (
              <Reveal key={p.id} as="li" delay={(i % 3) * 60}>
                <div className="flex h-full flex-col rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="mb-3 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-sm font-black text-white">{i + 1}</span><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">{p.when}</span></div>
                  <h3 className="text-lg font-black leading-snug">{p.title}</h3>
                  <p className="mt-1.5 flex-1 text-[15px] leading-relaxed text-muted-foreground">{p.goal}</p>
                  <p className="mt-4 border-l-4 border-primary pl-3 text-sm font-semibold leading-snug"><span className="text-primary">After · </span>{p.after}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 05 who */}
      <section id="who" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="who" title="Businesses that" accent="start here." lead="The kinds of business SelfRun AI is built for, and what each one gets." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {INDUSTRIES.map((x, i) => (
              <Reveal key={x.slug} delay={(i % 3) * 60}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                  <h3 className="text-lg font-black leading-snug">{x.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{x.summary}</p>
                  <ul className="mt-4 space-y-2">{x.needs.map((n) => <li key={n} className="flex gap-2.5 text-sm"><Check className="mt-0.5 h-4 w-4 flex-none text-primary" strokeWidth={3} />{n}</li>)}</ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 06 products */}
      <section id="products" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="products" title="Choose the products" accent="you need." lead="Every product is included in every plan. Start with a few and add the rest when your business is ready." />
          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map((g, i) => (
              <Reveal key={g.id} delay={(i % 2) * 60}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="mb-4 flex items-center gap-3"><span className="sr-icon h-11 w-11 flex-none"><Icon name={g.icon} className="h-5 w-5" /></span><div><h3 className="font-black leading-tight">{g.title}</h3><p className="text-xs text-muted-foreground">{g.lead}</p></div></div>
                  <ul className="grid gap-2 sm:grid-cols-2">{g.items.map((m) => <li key={m.key}><Link href={productPath(m.key)} className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-2.5 transition-all hover:border-primary/40 hover:shadow-md"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border/60 bg-card"><ProductLogo productKey={m.key} size={28} title={m.name} /></span><span className="min-w-0 text-sm font-black leading-tight group-hover:text-primary">{m.name}</span></Link></li>)}</ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 07 data */}
      <section id="data" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="data" title="Bring your data" accent="with you." lead="You do not start from an empty screen. Import what you already have, and take it back out whenever you choose." />
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {[
              { icon: FileSpreadsheet, t: "Import from a spreadsheet (CSV)", x: "Bring leads, clients and employees in from a spreadsheet, into the product that uses them. Every row is checked first." },
              { icon: LockKeyhole, t: "Kept apart from every other business", x: "Your records belong to your business, and one business's data is never visible to another's." },
              { icon: BookOpen, t: "Export and leave any time", x: "Your data stays yours. You can export it, or leave, whenever you choose." },
            ].map(({ icon: I, t, x }, i) => (
              <Reveal key={t} delay={i * 70}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-7 shadow-sm"><span className="sr-icon mb-5 h-14 w-14"><I className="h-6 w-6" /></span><h3 className="text-xl font-black">{t}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{x}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 08 help */}
      <section id="help" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="help" title="Help is" accent="always close." lead="Learn on your own, see it with examples from your business, or ask the team." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: "book" as const, t: "Read the setup guide", x: "Step-by-step guidance from registering to a fully set-up workspace.", href: "/docs/getting-started", c: "Open the guide" },
              { icon: "target" as const, t: "See it with your examples", x: "Bring one process you want to improve and we will show how the software handles it.", href: "/demo", c: "Request a demo" },
              { icon: "chat" as const, t: "Ask us anything", x: "Questions about getting started, plans or safety? Send a message and we reply within one business day.", href: "/contact", c: "Contact us" },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}>
                <Link href={c.href} className="group flex h-full flex-col rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-5 h-14 w-14 transition-transform group-hover:scale-110"><Icon name={c.icon} className="h-6 w-6" /></span>
                  <h3 className="text-xl font-black">{c.t}</h3>
                  <p className="mt-2 flex-1 leading-relaxed text-muted-foreground">{c.x}</p>
                  <span className="mt-5 inline-flex items-center gap-2 font-bold text-primary">{c.c}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 09 privacy */}
      <section id="privacy" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="privacy" title="No customer list" accent="without permission." lead="We do not publish private account, workspace or client information as marketing." />
          <Reveal>
            <div className="mx-auto max-w-4xl rounded-[2rem] border border-border/60 bg-card p-7 shadow-sm sm:p-10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <span className="sr-icon h-14 w-14 flex-none"><LockKeyhole className="h-6 w-6" /></span>
                <div>
                  {STORIES.length > 0 ? (
                    <p className="leading-relaxed text-muted-foreground">Customer stories approved for publication are available on our <Link href="/success-stories" className="font-bold text-primary">success stories page</Link>.</p>
                  ) : (
                    <><h3 className="text-xl font-black">No businesses are listed publicly</h3><p className="mt-2 leading-relaxed text-muted-foreground">No businesses are listed publicly yet. A business will appear here only after it has agreed to be named and featured.</p></>
                  )}
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">{["Names and account details stay private", "A business is listed only if it agrees", "One business's workspace is never shown to another", "Stories are published only with approval"].map((x) => <li key={x} className="flex gap-2.5 text-sm font-semibold"><Check className="mt-0.5 h-4 w-4 flex-none text-primary" strokeWidth={3} />{x}</li>)}</ul>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 10 featured */}
      <section id="featured" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="featured" title="Want to be" accent="featured?" lead="If you would like your business listed, tell us. It is always your choice." />
          <Reveal>
            <div className="relative mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-brand-accent text-white shadow-2xl shadow-primary/25 lg:grid-cols-[1.1fr_1fr]">
              <Sparkles className="absolute -right-4 -top-4 h-40 w-40 text-white/10" aria-hidden />
              <div className="relative p-8 sm:p-10">
                <h3 className="text-2xl font-black leading-snug sm:text-3xl">Ask about getting started or being listed</h3>
                <p className="mt-3 leading-relaxed text-white/85">Message us to get started, or to be named alongside your story. Nothing is shown publicly until you have approved it.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-primary shadow-lg transition-transform hover:-translate-y-0.5">Ask about getting started <MessageCircle className="h-4 w-4" /></Link>
                  <Link href="/signup" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">Create a workspace</Link>
                </div>
              </div>
              <div className="relative border-t border-white/20 bg-white/10 p-8 sm:p-10 lg:border-l lg:border-t-0">
                <p className="mb-4 text-xs font-black uppercase tracking-widest text-white/80">You stay in control</p>
                <ul className="space-y-3">{["You decide whether to be listed", "You approve what is said", "You can ask for a change later"].map((x) => <li key={x} className="flex gap-3 font-semibold"><Check className="mt-0.5 h-5 w-5 flex-none" strokeWidth={3} />{x}</li>)}</ul>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand title="Create your workspace, free." lead="Every feature is included in every plan. Start free, no card needed." />
      <FaqSection
        topics={["Setup", "Data & security"]}
        limit={4}
        title="Questions about"
        accent="getting started."
        lead="How getting set up works, what it costs and what stays private."
        extra={[
          { q: "How do I get my business set up?", a: "Register your business workspace, add your name and logo, invite your team with roles and switch on the products you need. The setup guide walks you through each step." },
          { q: "Is there a setup fee or a sales process?", a: "No. You start free on your own, and every feature is included in every plan." },
          { q: "Will my business be listed publicly?", a: "Only if you agree. We do not publish customer names or account details without explicit permission." },
        ]}
      />
    </>
  );
}
