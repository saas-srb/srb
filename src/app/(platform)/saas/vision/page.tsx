import { breadcrumbList, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Quote, X } from "lucide-react";
import { CtaBand, HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import FaqSection from "@/components/platform/saas/FaqSection";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import Icon from "@/components/platform/saas/Icon";
import Reveal from "@/components/platform/saas/Reveal";
import CountStats from "@/components/platform/saas/CountStats";
import ProductLogo from "@/components/products/ProductLogo";
import { AI_CAPABILITIES, INDUSTRIES, SECURITY_POINTS, type IconKey } from "@/lib/platform/saas/content";
import { GROWTH, YOUR_BRAND } from "@/lib/platform/saas/site";
import { getFeatureGroups } from "@/lib/platform/saas/modules";
import { PANEL_DETAIL } from "@/lib/platform/saas/panel-detail";
import { productPath } from "@/lib/platform/saas/product-routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = pageMeta({ path: "/vision", title: "Our Vision: A Business That Runs Itself", description: "Where SelfRun AI is heading and why: one software for your whole business, automation you can trust, AI that stays within each person's access, and your own brand on everything.", keywords: ["SelfRun AI vision", "future of business automation", "AI-first business platform", "autonomous business software", "business operating system vision", "automation with human approval"], tag: "Vision" });

const NAV = [
  { id: "vision", label: "Our vision" },
  { id: "problem", label: "Why it exists" },
  { id: "beliefs", label: "What we believe" },
  { id: "today", label: "What exists today" },
  { id: "flow", label: "Work that moves" },
  { id: "ai", label: "AI you can trust" },
  { id: "control", label: "Safe and yours" },
  { id: "journey", label: "Your journey" },
  { id: "promises", label: "Our promises" },
  { id: "next", label: "What next" },
];

const PILLARS: { icon: IconKey; title: string; text: string }[] = [
  { icon: "workflow", title: "It runs the routine", text: "Copying details between apps, chasing approvals and building reports become the software's job, not a person's." },
  { icon: "shield", title: "You stay in control", text: "Every automatic action is recorded and explained, automations can be paused, and people approve anything that moves money." },
  { icon: "target", title: "It is your business's", text: "Your logo, colours, web address and apps on everything, with your data kept apart from every other business's." },
];

const PROBLEMS = [
  { title: "The same details typed again and again", text: "A lead becomes a client, a new hire becomes an employee, an order becomes an invoice. Each time, someone copies the details into the next app." },
  { title: "Approvals buried in inboxes", text: "A request waits for a reply in someone's email. Nobody can say who is holding it up, and there is no record of who approved what." },
  { title: "Reports made by hand", text: "A simple question such as “how much are customers overdue?” means exporting data from three places and joining it together in a spreadsheet." },
  { title: "Different rules in every app", text: "Each app has its own users, its own permissions and its own settings, so it is hard to see who can do what, and harder still to keep it tidy." },
];

const BELIEFS = [
  { icon: "bolt" as IconKey, title: "A business should run itself", text: "People do their best work with customers, creativity and growth. The repetitive jobs of running a business belong to software.", means: "Automatic reminders, approvals and follow-ups that run by themselves, with every run recorded." },
  { icon: "layers" as IconKey, title: "Start small, add what you need", text: "Each product works on its own, so you choose what fits your business today and add more only when you need it.", means: "Products you can use alone or together, managed from one place." },
  { icon: "brain" as IconKey, title: "AI should ask permission", text: "AI is useful when it answers from your real records, shows how it got there, and only sees what the person asking is allowed to see.", means: "AI that works within each person's access. Any change it suggests waits for approval." },
  { icon: "lock" as IconKey, title: "Your data is yours", text: "Every business's data is kept strictly apart, secrets are stored encrypted, and you can export your data or leave at any time.", means: "Data kept separate for each business, roles and per-action permissions, and a record of every action." },
  { icon: "building" as IconKey, title: "The brand on it is yours", text: "Your team, customers and visitors should meet your business, not ours. SelfRun stays out of sight.", means: "Your logo, colours, web address, emails and apps." },
  { icon: "check" as IconKey, title: "Say only what is true", text: "We describe the product as it is today. Where there is nothing to show yet, we say so instead of inventing it.", means: "No made-up stories, discounts or promised dates." },
];

const PROMISES = [
  "Every plan includes every feature, and you can start free.",
  "We do not publish guessed release dates, and we never present an idea as a promise.",
  "AI never changes anything until a person approves it.",
  "One business's data is never visible to another.",
  "You can export your data and leave whenever you choose.",
  "What this website describes is what the product does today.",
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

export default async function VisionPage() {
  const groups = await getFeatureGroups();
  const products = groups.flatMap((g) => g.items);
  const byKey = new Map(products.map((m) => [m.key, m]));
  const handoffs = products.flatMap((m) => {
    const c = PANEL_DETAIL[m.key]?.connects?.[0];
    const to = c ? byKey.get(c.panel) : undefined;
    return c && to ? [{ from: m, to, text: c.text }] : [];
  }).slice(0, 9);
  return (
    <>
      <JsonLd data={[webPage({ type: "AboutPage", path: "/vision", name: "Product vision", description: "Where SelfRun AI is heading and why: one software for your whole business, automation you can trust, AI that stays within each person's access, and your own brand on everything." }), breadcrumbList([{ name: "Home", path: "/" }, { name: "Product vision", path: "/vision" }])]} />
      <PageHero
        art="features"
        eyebrow="Our vision"
        title="A business that"
        accent="runs itself."
        lead="Our vision is simple: every business, whatever its size, gets one intelligent software that handles the routine work, so people can spend their time on customers, creativity and growth. This page explains what that means, why we build it this way and where it stands today."
        photo="team-desk"
        shot="workspace"
        shotName="SelfRun CommandOS"
        chip={{ title: "Products live today", text: "Every feature, all in every plan" }}
      >
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Explore the products", href: "/products" }} />
      </PageHero>

      <SectionScrollNav items={NAV} label="Vision products" numbered />

      {/* 01 the vision */}
      <section id="vision" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="vision" title="One sentence, three promises." lead="This is what we are building, in one line, and the three ideas that hold it together." />
          <Reveal>
            <figure className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-brand-accent p-8 text-white shadow-2xl shadow-primary/25 sm:p-12">
              <Quote className="absolute -right-4 -top-4 h-40 w-40 text-white/10" aria-hidden />
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">Our vision</p>
              <blockquote className="relative mt-3 max-w-4xl text-2xl font-black leading-snug sm:text-4xl">Every business, from a ten-person team to a large organisation, should be able to run on one intelligent software that handles the routine work, so its people can focus on what only people can do.</blockquote>
            </figure>
          </Reveal>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-5 h-14 w-14 transition-transform group-hover:scale-110"><Icon name={p.icon} className="h-6 w-6" /></span>
                  <h3 className="text-xl font-black">{p.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">{p.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 02 the problem */}
      <section id="problem" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="problem" title="Why this needs to exist." lead="Finding software is rarely the problem. The trouble starts in the gaps between the apps a business already uses." />
          <div className="grid gap-5 md:grid-cols-2">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.title} delay={i * 70}>
                <div className="flex h-full gap-5 rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500"><X className="h-5 w-5" strokeWidth={3} /></span>
                  <div><h3 className="text-lg font-black leading-snug">{p.title}</h3><p className="mt-1.5 leading-relaxed text-muted-foreground">{p.text}</p></div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-8"><p className="rounded-3xl border border-primary/20 bg-primary/[0.06] p-6 text-lg font-bold leading-snug sm:p-8 sm:text-xl">That in-between work is exactly what we want software to take over, so nobody on your team has to be the glue holding things together.</p></Reveal>
        </div>
      </section>

      {/* 03 beliefs */}
      <section id="beliefs" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="beliefs" title="Six beliefs behind everything we build." lead="Each belief on the left becomes something real in the product, shown on the right." />
          <div className="space-y-4">
            {BELIEFS.map((b, i) => (
              <Reveal key={b.title} delay={(i % 2) * 60}>
                <div className="grid overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-lg md:grid-cols-[1.2fr_1fr]">
                  <div className="flex gap-5 p-6 sm:p-8">
                    <span className="sr-icon h-14 w-14 flex-none"><Icon name={b.icon} className="h-6 w-6" /></span>
                    <div><p className="text-xs font-black uppercase tracking-widest text-primary">Belief {String(i + 1).padStart(2, "0")}</p><h3 className="mt-1 text-xl font-black leading-snug">{b.title}</h3><p className="mt-2 leading-relaxed text-muted-foreground">{b.text}</p></div>
                  </div>
                  <div className="flex items-center gap-3 border-t border-border/50 bg-gradient-to-br from-primary/[0.07] to-brand-accent/[0.07] p-6 sm:p-8 md:border-l md:border-t-0">
                    <ArrowRight className="hidden h-5 w-5 flex-none text-primary md:block" />
                    <div><p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">In the product</p><p className="mt-1 font-bold leading-snug">{b.means}</p></div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 04 built today */}
      <section id="today" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="today" title="What exists today." lead="This is not a slide deck. These products are live now, and every one of them is included in every plan." />
          <Reveal><div className="mb-10 rounded-3xl border border-border/60 bg-card px-4 shadow-sm"><CountStats items={[{ v: "All", l: "ready-made products" }, { v: "AI", l: "built into the software" }, { v: "Every", l: "area of your business" }, { v: "Free", l: "to start, every feature included" }]} /></div></Reveal>
          <div className="grid gap-5 lg:grid-cols-2">
            {groups.map((g, i) => (
              <Reveal key={g.id} delay={(i % 2) * 70}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <div className="flex items-start gap-4"><span className="sr-icon h-12 w-12 flex-none"><Icon name={g.icon} className="h-5 w-5" /></span><div><h3 className="text-lg font-black">{g.title}</h3><p className="text-sm leading-snug text-muted-foreground">{g.lead}</p></div></div>
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {g.items.map((m) => (
                      <li key={m.key}><Link href={productPath(m.key)} className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-2.5 transition-all hover:border-primary/40 hover:shadow-md"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-border/60 bg-card"><ProductLogo productKey={m.key} size={28} title={m.name} /></span><span className="min-w-0 text-sm font-black leading-tight group-hover:text-primary">{m.name}</span></Link></li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-12">
            <p className="mb-5 text-xs font-black uppercase tracking-[0.2em] text-primary">Who it is built for</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((x, i) => (
                <Reveal key={x.slug} delay={(i % 3) * 60}>
                  <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm"><h3 className="font-black">{x.name}</h3><p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{x.summary}</p></div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* flow between products */}
      <section id="flow" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="flow" title="Work that moves on its own." lead="Each product works on its own. When you choose to connect them, the next step starts without anyone copying anything. These are real hand-offs the software supports." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {handoffs.map((h, i) => (
              <Reveal key={`${h.from.key}-${h.to.key}`} delay={(i % 3) * 60}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={productPath(h.from.key)} className="flex min-w-0 items-center gap-2"><span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border/60 bg-background"><ProductLogo productKey={h.from.key} size={30} title={h.from.name} /></span><span className="truncate text-sm font-black">{h.from.name.replace(/^SelfRun\s+/i, "")}</span></Link>
                    <ArrowRight className="h-5 w-5 flex-none text-primary" />
                    <Link href={productPath(h.to.key)} className="flex min-w-0 items-center gap-2"><span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border/60 bg-background"><ProductLogo productKey={h.to.key} size={30} title={h.to.name} /></span><span className="truncate text-sm font-black">{h.to.name.replace(/^SelfRun\s+/i, "")}</span></Link>
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{h.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* AI */}
      <section id="ai" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="ai" title="AI that asks permission." lead="AI is part of the software, but it only sees what the person asking is allowed to see, shows how it reached its answer, and never changes anything until a person approves." />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {AI_CAPABILITIES.map((a, i) => (
              <Reveal key={a.title} delay={(i % 3) * 60}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mb-4 h-12 w-12 transition-transform group-hover:scale-110"><Icon name={a.icon} className="h-5 w-5" /></span>
                  <h3 className="text-lg font-black leading-snug">{a.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{a.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* control: security and brand */}
      <section id="control" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="control" title="Safe by design. Yours by default." lead="Two things matter as much as features: your data is protected, and everything your people and customers see carries your name." />
          <div className="grid gap-6 lg:grid-cols-2">
            <Reveal >
              <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-sm">
                <div className="flex items-center gap-4 border-b border-border/50 px-6 py-5 sm:px-8">
                  <span className="sr-icon h-14 w-14 flex-none rounded-2xl"><Icon name="shield" className="h-6 w-6" /></span>
                  <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Safe by design</p><h3 className="text-xl font-black leading-snug">Your data is protected</h3><p className="text-sm text-muted-foreground">Isolation, access, records and encryption.</p></div>
                </div>
                <ul className="flex-1 divide-y divide-border/50 px-3 py-2 sm:px-4">
                  {SECURITY_POINTS.slice(0, 5).map((x) => (
                    <li key={x.title} className="group flex gap-4 rounded-2xl px-3 py-4 transition-colors hover:bg-primary/[0.05]"><span className="sr-icon h-11 w-11 flex-none rounded-xl transition-transform group-hover:scale-110"><Icon name={x.icon} className="h-5 w-5" /></span><span className="min-w-0"><span className="block font-black">{x.title}</span><span className="block text-[15px] leading-relaxed text-muted-foreground">{x.body}</span></span></li>
                  ))}
                </ul>
                <div className="border-t border-border/50 bg-muted/30 px-6 py-4 sm:px-8">
                  <Link href="/security" className="inline-flex items-center gap-2 font-bold text-primary hover:underline">Read how security and trust work <ArrowRight className="h-4 w-4" /></Link>
                </div>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-gradient-to-br from-primary/[0.07] via-card to-brand-accent/[0.07] shadow-sm">
                <div className="flex items-center gap-4 border-b border-border/50 px-6 py-5 sm:px-8">
                  <span className="sr-icon h-14 w-14 flex-none rounded-2xl"><Icon name="target" className="h-6 w-6" /></span>
                  <div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Yours by default</p><h3 className="text-xl font-black leading-snug">It carries your name</h3><p className="text-sm text-muted-foreground">Your logo, apps, web address and notifications.</p></div>
                </div>
                <ul className="flex-1 divide-y divide-border/50 px-3 py-2 sm:px-4">
                  {YOUR_BRAND.slice(0, 5).map((x) => (
                    <li key={x.key} className="group flex gap-4 rounded-2xl px-3 py-4 transition-colors hover:bg-primary/[0.05]"><span className="sr-icon h-11 w-11 flex-none rounded-xl transition-transform group-hover:scale-110"><Icon name={x.icon} className="h-5 w-5" /></span><span className="min-w-0"><span className="block font-black">{x.title}</span><span className="block text-[15px] leading-relaxed text-muted-foreground">{x.text}</span></span></li>
                  ))}
                </ul>
                <div className="border-t border-border/50 bg-muted/30 px-6 py-4 sm:px-8">
                  <Link href="/docs/brand-your-workspace" className="inline-flex items-center gap-2 font-bold text-primary hover:underline">See how branding works <ArrowRight className="h-4 w-4" /></Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 05 the journey */}
      <section id="journey" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="journey" title="From day one to a business that runs itself." lead="A suggested path, not a rule. Switch on a few products at each stage and leave the rest until you need them." />
          <ol className="space-y-5">
            {GROWTH.map((ph, i) => (
              <Reveal key={ph.id} as="li" delay={(i % 2) * 60}>
                <div className="grid overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm lg:grid-cols-[260px_1fr]">
                  <div className="flex items-center gap-4 border-b border-border/50 bg-gradient-to-br from-primary to-brand-accent p-6 text-white lg:flex-col lg:items-start lg:justify-between lg:border-b-0">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-lg font-black">{i + 1}</span>
                    <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">{ph.when}</p><p className="mt-0.5 text-lg font-black leading-snug">{ph.title}</p></div>
                  </div>
                  <div className="p-6 sm:p-8">
                    <p className="text-lg font-bold leading-snug">{ph.goal}</p>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl bg-rose-500/[0.07] p-4"><p className="text-[11px] font-black uppercase tracking-widest text-rose-500">Before</p><p className="mt-1 text-sm leading-relaxed">{ph.before}</p></div>
                      <div className="rounded-2xl bg-emerald-500/[0.09] p-4"><p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">After</p><p className="mt-1 text-sm leading-relaxed">{ph.after}</p></div>
                    </div>
                    <ul className="mt-5 space-y-2">{ph.outcomes.map((o) => <li key={o} className="flex gap-2.5 text-[15px]"><Check className="mt-0.5 h-4 w-4 flex-none text-primary" strokeWidth={3} />{o}</li>)}</ul>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 06 promises */}
      <section id="promises" className="sr-section bg-muted/10" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="promises" title="What we hold ourselves to." lead="A vision is only worth something if you can check it. These are the commitments behind it." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROMISES.map((p, i) => (
              <Reveal key={p} delay={(i % 3) * 60}>
                <div className="flex h-full gap-4 rounded-3xl border border-border/60 bg-card p-6 shadow-sm"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-white"><Check className="h-4 w-4" strokeWidth={3.5} /></span><p className="font-bold leading-snug">{p}</p></div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 07 what's next */}
      <section id="next" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <Head id="next" title="Where it goes from here." lead="We keep improving what people use every day. We announce something only when it is ready to be described clearly." />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { t: "See what is available now", x: "The roadmap page lists everything the software offers today, taken from the live product.", href: "/roadmap", c: "Open the roadmap" },
              { t: "Tell us what to build next", x: "Tell us which job you want made easier. Real customer needs decide what we work on.", href: "/contact", c: "Share feedback" },
              { t: "Try it with your own business", x: "Start free, switch on the products you need and see it work on your own data.", href: "/signup", c: "Get started free" },
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

      <CtaBand title="Build a business that runs itself." lead="Every feature is included in every plan. Start free, no card needed." />
      <FaqSection
        topics={["General", "Data & security", "Your brand"]}
        limit={5}
        title="Questions about"
        accent="the vision."
        lead="What we are building, how far it has come and how we decide what comes next."
        extra={[
          { q: "What is the SelfRun vision?", a: "Every business should be able to run on one intelligent software that handles the routine work, so its people can focus on customers, creativity and growth. In practice that means one software with a product for every job, automation you can trust, AI that stays within each person's access, and your own brand on everything." },
          { q: "Is the vision already built, or is it a plan?", a: `The products on this page are live today and all of them are included in every plan. We describe the product as it is now and do not present ideas as commitments.` },
          { q: "Will you publish release dates?", a: "No. We announce something only when it is ready to be described clearly. The roadmap page lists what the software offers today." },
        ]}
      />
    </>
  );
}
