import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bot, BrainCircuit, Check, CircleAlert, CircleCheckBig, MessagesSquare, Palette, Target, TrendingUp, Wand2, Workflow, PackageCheck, ShieldCheck, Sparkles, Users, Wallet, Zap } from "lucide-react";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { FEATURE_LISTS, PANEL_VALUE, featureCount } from "@/lib/platform/saas/feature-lists";
import { PANEL_DETAIL } from "@/lib/platform/saas/panel-detail";
import { EXTRA_SCREENS } from "@/lib/platform/saas/site";
import { heroFor, marketingFor, screenFor } from "@/lib/platform/saas/screens";
import { signupProductHref } from "@/lib/platform/billing/signup-plan-rule";
import { INCLUDED_PRODUCTS, INCLUDED_WITH } from "@/lib/platform/products/selection";
import ProductLogo from "@/components/products/ProductLogo";
import Reveal from "@/components/platform/saas/Reveal";
import { productKeyFromSlug, productPath, productSlugFor } from "@/lib/platform/saas/product-routes";
import { productShort } from "@/lib/platform/saas/product-short";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { PRODUCT_AUDIENCE, PRODUCT_CATEGORY, PRODUCT_SEO } from "@/lib/platform/saas/product-seo";
import JsonLd from "@/components/platform/saas/JsonLd";
import { breadcrumbList, howTo, softwareApplication, webPage } from "@/lib/platform/saas/jsonld";
import { productFaqs } from "@/lib/platform/saas/product-faq";
import { PRODUCT_STORY } from "@/lib/platform/saas/product-story";
import SectionScrollNav from "@/components/platform/saas/SectionScrollNav";
import NumberedHead from "@/components/platform/saas/NumberedHead";
import { HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import FaqSection from "@/components/platform/saas/FaqSection";
import ScrollToTop from "@/components/platform/saas/product/ScrollToTop";

export const dynamic = "force-dynamic";

async function load(key: string) {
  const productKey = productKeyFromSlug(key);
  if (!productKey) return null;
  const all = await getFeatureModules();
  const i = all.findIndex((m) => m.key === productKey);
  return i < 0 ? null : { m: all[i], all, prev: all[(i + all.length - 1) % all.length], next: all[(i + 1) % all.length] };
}

export async function generateProductMetadata(key: string): Promise<Metadata> {
  const d = await load(key);
  if (!d) return {};
  const { m } = d;
  const seo = PRODUCT_SEO[m.key];
  const value = PANEL_VALUE[m.key];
  const bare = m.name.replace(/^SelfRun\s+/i, "");
  return pageMeta({
    path: productPath(m.key),
    title: seo?.title ?? `${bare}: ${m.headline}`,
    description: `${m.name}: ${m.headline}. ${m.summary}${value ? ` Replaces ${value.replaces}.` : ""} Free to start.`,
    keywords: [m.name, bare, `${m.name} features`, `${bare} free`, `${bare} software`, ...(seo?.keywords ?? [])],
    tag: "Product",
  });
}

/** The page read in order: what it is, which problem it solves, where it helps, how it works, what it does, and why to use it. */
const SECTIONS = [
  { id: "what", label: "Overview" },
  { id: "problems", label: "Problems" },
  { id: "usecases", label: "Use cases" },
  { id: "how", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "ai", label: "AI" },
  { id: "automation", label: "Automation" },
  { id: "who", label: "Users" },
  { id: "why", label: "Benefits" },
  { id: "included", label: "Works with" },
  { id: "faq", label: "FAQ" },
];

const endDot = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);

const COUNT_WORDS: Record<number, string> = { 3: "Three", 4: "Four", 5: "Five", 6: "Six" };
const BENEFIT_ICONS = [Target, TrendingUp, Workflow, CircleCheckBig];
const AI_ICONS = [MessagesSquare, Wand2, BrainCircuit, Bot];

/** Photographs for the use-case cards; each product starts at a different one. */
const CASE_PHOTOS = ["planning", "pair-work", "laptop-talk", "colleagues", "team-work", "office", "success", "open-office", "presentation", "team-desk", "analytics"];

interface Visual { src: string; icon?: LucideIcon; title?: string; text?: string; art?: boolean; right?: boolean; sticky?: boolean }

/** The picture beside a section's content: a photograph with a floating note about the section, or the product's own artwork (`art`). */
function Picture({ src, icon: NoteIcon, title, text, art, sticky }: Visual) {
  return (
    <Reveal className={`min-w-0 ${sticky ? "lg:sticky lg:top-40 lg:self-start" : "h-full"}`}>
      <figure className={`group relative w-full ${art ? "flex h-full items-center" : `aspect-[16/10] overflow-hidden rounded-[28px] shadow-2xl shadow-primary/20 ring-1 ring-border/60 ${sticky ? "lg:aspect-[3/4] lg:max-h-[70vh]" : "lg:aspect-auto lg:h-full lg:min-h-[22rem]"}`}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" decoding="async" className={art ? "h-auto w-full drop-shadow-2xl transition-transform duration-500 group-hover:scale-[1.03]" : "absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"} />
        {!art && <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-primary/20" aria-hidden />}
        {title && !art && NoteIcon && (
          <figcaption className="absolute inset-x-4 bottom-4 hidden items-center gap-4 sm:flex rounded-2xl bg-background/90 p-4 shadow-xl ring-1 ring-border/60 backdrop-blur-md">
            <span className="sr-icon h-11 w-11 flex-none rounded-xl"><NoteIcon className="h-5 w-5" /></span>
            <span className="min-w-0"><span className="block font-black leading-snug text-foreground">{title}</span>{text && <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{text}</span>}</span>
          </figcaption>
        )}
      </figure>
    </Reveal>
  );
}

/** One section of the page, headed the way the other pages head theirs: a numbered circle, what the section is, and its title. `band` paints the whole section in the brand colour. */
function Band({ id, n, eyebrow, title, accent, lead, tint, band, visual, children }: { visual?: Visual; id: string; n: number; eyebrow: string; title: React.ReactNode; accent?: string; lead?: React.ReactNode; tint?: boolean; band?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={`relative py-12 lg:py-14 ${band ? "sr-band" : `border-t border-border/50 ${tint ? "bg-muted/10" : ""}`}`} style={{ scrollMarginTop: 140 }}>
      <div className="sr-container">
        <NumberedHead n={n} eyebrow={eyebrow} title={title} accent={accent} lead={lead} band={band} />
        {visual ? (
          <div className={`grid gap-6 ${visual.right ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"}`}>
            <div className={`min-w-0 ${visual.right ? "lg:order-2" : ""}`}><Picture {...visual} /></div>
            <div className="min-w-0">{children}</div>
          </div>
        ) : children}
      </div>
    </section>
  );
}

const box = "h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm sm:p-7";
const tile = `group ${box} transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10`;

export default async function ProductDetailPage({ productSlug }: { productSlug: string }) {
  const d = await load(productSlug);
  if (!d) notFound();
  const { m, all, prev, next } = d;
  if (productSlug !== productSlugFor(m.key)) permanentRedirect(productPath(m.key));

  const groups = FEATURE_LISTS[m.key] ?? [];
  const total = featureCount(m.key) || m.capabilities.length;
  const value = PANEL_VALUE[m.key];
  const detail = PANEL_DETAIL[m.key];
  const byKey = new Map(all.map((x) => [x.key, x]));
  const extras = (EXTRA_SCREENS[m.key] ?? []).filter((x) => screenFor(x.key));
  const connects = (detail?.connects ?? []).flatMap((c) => { const o = byKey.get(c.panel); return o ? [{ o, text: c.text }] : []; });
  const story = PRODUCT_STORY[m.key];
  const faqs = productFaqs(m, { groups, total, value, detail, story, connected: connects.map((c) => c.o.name) });
  const shot = screenFor(m.key);
  const photoAt = (i: number) => CASE_PHOTOS[(all.indexOf(m) * 3 + i) % CASE_PHOTOS.length];
  // Photographs 0-2 are on the use-case cards and 3 may be the overview; every other section takes its own.
  const photo = (i: number) => `/selfrun/photos/${photoAt(i)}.jpg`;
  // Artwork that shows another product's screen, or a feature the product no longer has, is replaced by a photograph.
  const artwork = ["website", "portal", "lpms"].includes(m.key) ? null : heroFor(`panel-${m.key}`);
  // The banner already shows the product's main screen, so the overview shows another of its screens, or a photograph.
  const picture = extras.map((x) => marketingFor(x.key)).find((x) => x && x !== marketingFor(m.key)) ?? `/selfrun/photos/${photoAt(3)}.jpg`;
  const name = m.name.replace(/^SelfRun\s+/i, "");
  const tagline = (PRODUCT_SEO[m.key]?.title ?? "").split(": ")[1] ?? m.headline;

  // What comes with what: the same rules sign-up and billing use.
  const always = [...INCLUDED_PRODUCTS.filter((k) => k !== "admin"), "support"];
  const brings = (INCLUDED_WITH[m.key as keyof typeof INCLUDED_WITH] ?? []) as readonly string[];
  const parent = Object.entries(INCLUDED_WITH).find(([key, list]) => key !== m.key && (list as readonly string[]).includes(m.key))?.[0];
  const comesWithAll = always.includes(m.key);
  const alsoGet = [...(m.key === "cms" ? ["website"] : []), ...brings, ...always.filter((k) => k !== m.key)].flatMap((k) => { const o = byKey.get(k); return o ? [{ o, brought: !always.includes(k) }] : []; });
  const howToGet = comesWithAll
    ? "It comes with every workspace, whichever products you take."
    : m.key === "website"
      ? "Your website comes with SiteCraft."
      : parent && !["sop"].includes(m.key)
        ? `It comes with ${byKey.get(parent)?.name ?? parent}, at no extra charge.`
        : "Take it on its own or with other products. Free to start, no card needed.";

  const show: Record<string, boolean> = { what: !!story, problems: !!story, usecases: !!story, how: !!detail, ai: !!story, automation: !!story, who: !!detail, included: alsoGet.length > 0 || connects.length > 0 };
  const nav = SECTIONS.filter((x) => show[x.id] !== false);
  // Each chapter is numbered and every other one tinted, so a reader always knows where one ends and the next begins.
  const at = (id: string) => { const i = nav.findIndex((x) => x.id === id); return { n: i + 1, tint: i % 2 === 1 }; };

  const ld = [
    softwareApplication({
      path: productPath(m.key), name: m.name, alternateName: name, description: `${m.headline}. ${m.summary}`,
      subCategory: PRODUCT_CATEGORY[m.key], audience: PRODUCT_AUDIENCE[m.key], features: m.capabilities, keywords: PRODUCT_SEO[m.key]?.keywords ?? [], screenshots: [shot, ...extras.map((x) => screenFor(x.key))].filter((x): x is string => !!x),
      related: connects.map(({ o }) => ({ name: o.name, path: productPath(o.key) })),
    }),
    webPage({ path: productPath(m.key), name: `${m.name}: ${PRODUCT_SEO[m.key]?.title ?? m.headline}`, description: `${m.headline}. ${m.summary}`, about: m.name }),
    breadcrumbList([{ name: "Home", path: "/" }, { name: "Products", path: "/products" }, { name: m.name, path: productPath(m.key) }]),
    ...(detail?.workflow.length ? [howTo({ path: productPath(m.key), name: `How ${m.name} works`, description: `${m.headline}. ${m.summary}`, steps: detail.workflow.map((w) => ({ name: w.title, text: w.text })) })] : []),
  ];

  const facts = [
    detail && { icon: Users, label: "Made for", text: detail.audience.map((a) => a.who).join(", ") },
    value && { icon: Wallet, label: "Takes the place of", text: value.replaces },
    { icon: PackageCheck, label: "Features", text: `${total} features, all included` },
    { icon: ShieldCheck, label: "How you get it", text: howToGet },
  ].filter(Boolean) as { icon: typeof Users; label: string; text: string }[];

  return (
    <>
      <JsonLd data={ld} />
      <ScrollToTop pageKey={m.key} />

      {/* the same banner and section menu as every other page of the website */}
      <PageHero
        art={`product-${m.key}`}
        eyebrow={tagline}
        title={m.name}
        lead={story?.banner ?? endDot(detail?.intro ?? m.summary)}
        notes={["Free to start", `${total} features included`, "AI built in"]}
        photo="analytics"
        shot={m.key}
        shotName={m.name}
      >
        <HeroCtas primary={{ label: "Start free", href: signupProductHref(m.key) }} />
      </PageHero>

      <SectionScrollNav items={nav} label={`${m.name} sections`} numbered compact />

      {story && (
        <Band id="what" {...at("what")} eyebrow="What is it" title="What is" accent={`${name}?`}>
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
            <Reveal className="relative">
              <div className="sr-shot-glow" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picture} alt={`${m.name} in use`} loading="lazy" className="relative aspect-[4/3] w-full rounded-3xl object-cover shadow-2xl shadow-primary/20" />
              <span className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl bg-background py-3 pl-3 pr-5 shadow-xl ring-1 ring-border/60"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/60"><ProductLogo productKey={m.key} size={30} title={m.name} /></span><span><span className="block text-sm font-black leading-tight">{m.name}</span><span className="block text-xs font-semibold text-primary">{PRODUCT_CATEGORY[m.key] ?? "Product"}</span></span></span>
            </Reveal>
            <Reveal delay={80}>
              <p className="text-lg font-bold leading-relaxed sm:text-2xl sm:leading-relaxed">{story.what}</p>
              <div className="mt-6 rounded-r-2xl border-l-4 border-primary bg-primary/[0.07] p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Why a business needs it</p>
                <p className="mt-2 text-[17px] leading-relaxed">{story.why}</p>
              </div>
            </Reveal>
          </div>
          <ul className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-border/70 shadow-sm ring-1 ring-border/70 sm:grid-cols-2 lg:grid-cols-4" aria-label="At a glance">
            {facts.map((f) => (
              <li key={f.label} className="flex gap-4 bg-card p-6">
                <span className="sr-icon h-11 w-11 flex-none rounded-xl"><f.icon className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-[11px] font-black uppercase tracking-wider text-primary">{f.label}</span><span className="mt-1 block font-bold leading-snug">{f.text}</span></span>
              </li>
            ))}
          </ul>
        </Band>
      )}

      {story && (
        <Band id="problems" {...at("problems")} visual={{ src: photo(4), icon: CircleCheckBig, title: `${COUNT_WORDS[story.problems.length] ?? story.problems.length} problems, one product`, text: m.headline }} eyebrow="Business problems" title="The problems" accent="it solves." lead={`${COUNT_WORDS[story.problems.length] ?? story.problems.length} everyday problems that slow a business down, and how ${name} solves each one.`}>
          <ol className="grid gap-x-5 sm:grid-cols-2">
            {story.problems.map(([today, solved], i) => (
              <Reveal key={today} as="li" delay={i * 70} className="row-span-2 mb-5 grid grid-rows-subgrid gap-0 sm:[&:nth-last-child(-n+2)]:mb-0">
                <article className="group row-span-2 grid grid-rows-subgrid gap-0 overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/15">
                  <div className="relative bg-rose-500/[0.08] px-6 pb-8 pt-5">
                    <p className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.16em] text-rose-600 dark:text-rose-400"><span className="flex items-center gap-2"><CircleAlert className="h-4 w-4" />Problem</span><span className="text-3xl font-black tracking-tight opacity-30">{String(i + 1).padStart(2, "0")}</span></p>
                    <p className="mt-3 text-lg font-semibold leading-snug">{today}</p>
                  </div>
                  <div className="relative px-6 pb-5 pt-8">
                    <span className="sr-circle absolute -top-6 left-6 h-12 w-12 ring-4 ring-card transition-transform group-hover:scale-110" aria-hidden><ArrowDown className="h-5 w-5" /></span>
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-primary"><Check className="h-4 w-4" strokeWidth={3} />Solved</p>
                    <p className="mt-3 text-lg font-black leading-snug">{solved}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </ol>
        </Band>
      )}

      {story && (
        <Band id="usecases" {...at("usecases")} eyebrow="Use cases" title="Where it helps," accent="day to day." lead="Examples of real situations: who it is, and what they do in the product.">
          <ul className="grid gap-6 md:grid-cols-3">
            {story.useCases.map((u, i) => (
              <Reveal key={u.title} as="li" delay={i * 80}>
                <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/15">
                  <div className="relative h-48 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/selfrun/photos/${photoAt(i)}.jpg`} alt="" aria-hidden loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" aria-hidden />
                    <h3 className="absolute inset-x-5 bottom-4 text-2xl font-black leading-tight !text-white">{u.title}</h3>
                    <span className="sr-circle absolute left-5 top-5 h-10 w-10 font-black">{i + 1}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><Users className="h-3.5 w-3.5 flex-none" />{u.who}</p>
                    <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">{u.story}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </ul>
        </Band>
      )}

      {detail && (
        <Band id="how" {...at("how")} band visual={artwork ? { src: artwork, art: true, right: true } : { src: photo(5), right: true }} eyebrow="How it works" title="From start to" accent="finish." lead="How one job moves through the product, step by step.">
          <ol className="grid h-full gap-4 sm:grid-cols-2">
            {detail.workflow.map((w, i) => (
              <Reveal key={w.title} as="li" delay={i * 90}>
                <div className="h-full rounded-[18px] bg-white/10 p-6 ring-1 ring-white/20 backdrop-blur transition-all hover:-translate-y-1 hover:bg-white/[0.16]">
                  <p className="flex items-center gap-3"><span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white text-xl font-black text-[#14183a] shadow-xl">{i + 1}</span><span className="text-xs font-black uppercase tracking-[0.18em] text-white/70">Step {i + 1}</span></p>
                  <h3 className="mt-4 text-xl font-black leading-snug text-white">{w.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-white/80">{w.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </Band>
      )}

      <Band id="features" {...at("features")} visual={{ src: photo(6), icon: PackageCheck, title: `${total} features, all included`, text: `${groups.length} areas of ${name}`, sticky: true }} eyebrow="Features" title="Everything you" accent="can do." lead={`All ${total} features of ${m.name}, grouped by area.`}>
        <div className="gap-5 md:columns-2">
          {groups.map((g) => (
            <div key={g.title} className="mb-5 break-inside-avoid overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-xl hover:shadow-primary/10">
              <h3 className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-primary/15 to-brand-accent/10 px-6 py-5 text-xl font-black">{g.title}<span className="whitespace-nowrap rounded-full bg-background px-3 py-1 text-xs font-bold text-primary shadow-sm">{g.items.length === 1 ? "1 feature" : `${g.items.length} features`}</span></h3>
              <ul className="space-y-4 p-6">
                {g.items.map((f) => (
                  <li key={f.name} className="flex gap-3"><span className="sr-circle mt-0.5 h-5 w-5"><Check className="h-3 w-3" strokeWidth={3} /></span><span className="min-w-0"><span className="block font-bold leading-snug">{f.name}</span>{f.text && <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{f.text}</span>}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Band>

      {story && (
        <Band id="ai" {...at("ai")} visual={{ src: photo(7), icon: Sparkles, title: "AI built into your daily work", text: detail?.ask?.[0] ? `Ask: “${detail.ask[0]}”` : story.ai[0].title, right: true }} eyebrow="AI" title="What the AI" accent="does for you." lead={`The AI built into ${name}, and where you stay in charge.`}>
          <ul className="grid gap-4">
            {story.ai.map((x, i) => {
              const AiIcon = AI_ICONS[i % AI_ICONS.length];
              return (
                <Reveal key={x.title} as="li" delay={i * 70}>
                  <div className={`${tile} flex items-start gap-5`}>
                    <span className="sr-icon h-12 w-12 flex-none rounded-2xl"><AiIcon className="h-6 w-6" /></span>
                    <span className="min-w-0"><h3 className="text-lg font-black leading-snug">{x.title}</h3><span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{x.text}</span></span>
                  </div>
                </Reveal>
              );
            })}
          </ul>
          <Reveal delay={120}>
            <div className={`sr-band mt-5 grid items-center gap-6 rounded-[28px] p-6 text-white shadow-2xl shadow-primary/25 sm:px-8 `}>
              <div className="flex items-start gap-5">
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30"><ShieldCheck className="h-7 w-7" /></span>
                <span><span className="block text-2xl font-black">You stay in control</span><span className="mt-2 block text-[17px] leading-relaxed text-white/85">{story.aiRule}</span></span>
              </div>
              {detail?.ask?.length ? (
                <div>
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/70"><Sparkles className="h-4 w-4" />Ask in plain English</p>
                  <ul className="mt-3 flex flex-wrap gap-2.5">{detail.ask.map((q) => <li key={q} className="rounded-[18px] rounded-br-sm bg-white/15 px-4 py-2.5 text-[15px] font-semibold leading-snug ring-1 ring-white/25">{q}</li>)}</ul>
                </div>
              ) : null}
            </div>
          </Reveal>
        </Band>
      )}

      {story && (
        <Band id="automation" {...at("automation")} visual={{ src: photo(8), icon: Zap, title: "Runs while your team works", text: "No reminders to remember, no steps to forget." }} eyebrow="Automation" title="Work that happens" accent="on its own." lead="When something happens, the product takes the next step, so nobody has to remember it.">
          <ul className="flex h-full flex-col gap-4">
            {story.automation.map(([when, then], i) => (
              <Reveal key={when} as="li" delay={i * 70} className="flex-1">
                <div className="group grid h-full items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div className="flex flex-col justify-center rounded-3xl border border-border/60 bg-card px-6 py-4 shadow-sm"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">When</p><p className="mt-1 text-lg font-black leading-snug">{when}</p></div>
                  <span className="sr-circle h-11 w-11 self-center justify-self-center shadow-lg shadow-primary/30 transition-transform duration-300 group-hover:scale-110" aria-hidden><Zap className="h-5 w-5" /></span>
                  <div className="sr-band flex flex-col justify-center rounded-[18px] px-6 py-4 text-white shadow-lg shadow-primary/20"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/70">Then, by itself</p><p className="mt-1 text-lg font-black leading-snug">{then}</p></div>
                </div>
              </Reveal>
            ))}
          </ul>
        </Band>
      )}

      {detail && (
        <Band id="who" {...at("who")} visual={{ src: photo(9), icon: Users, title: "One product, a screen for every role", text: detail.audience.map((a) => a.who).join(", "), right: true }} eyebrow="Who uses it" title="Made for" accent="your team." lead="Everyone sees only what their role allows, so each person gets a screen that fits their job.">
          <ul className="grid h-full gap-x-5 gap-y-12 pt-8 sm:grid-cols-2">
            {detail.audience.map((x, i) => (
              <Reveal key={x.who} as="li" delay={i * 60}>
                <div className="group relative flex h-full flex-col items-center rounded-3xl border border-border/60 bg-card px-6 pb-7 pt-14 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-circle absolute -top-8 h-16 w-16 text-2xl font-black ring-8 ring-background transition-transform group-hover:scale-110" aria-hidden>{x.who.charAt(0)}</span>
                  <h3 className="text-xl font-black leading-snug">{x.who}</h3>
                  <span className="my-4 h-1 w-10 rounded-full bg-gradient-to-r from-primary to-brand-accent" aria-hidden />
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{x.does}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </Band>
      )}

      <Band id="why" {...at("why")} eyebrow="Why use it" title="Why use" accent={`${name}?`} lead="What changes for your business once you start using it.">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* the promise: what you get, and what it replaces */}
          <Reveal>
            <div className="sr-band flex h-full flex-col justify-between gap-5 rounded-[28px] p-6 text-white shadow-2xl shadow-primary/25 sm:p-7">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo(10)} alt="" loading="lazy" decoding="async" className="aspect-[16/6] w-full rounded-2xl object-cover shadow-xl ring-1 ring-white/25" />
              <div>
                <div className="flex items-center gap-4"><span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-white shadow-lg"><ProductLogo productKey={m.key} size={38} title={m.name} /></span><h3 className="text-xl font-black leading-tight text-white sm:text-2xl">{m.headline}</h3></div>
                <p className="mt-4 text-base leading-relaxed text-white/85">{m.outcome}</p>
              </div>
              {value && (
                <p className="rounded-[18px] bg-white/10 px-5 py-3 ring-1 ring-white/20">
                  <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-white/70">Takes the place of</span>
                  <span className="mt-1 block text-lg font-bold leading-snug">{value.replaces}</span>
                </p>
              )}
            </div>
          </Reveal>
          <ul className="grid gap-5 sm:grid-cols-2">
            {(value?.benefits ?? m.capabilities.slice(0, 4)).map((b, i) => {
              const BenefitIcon = BENEFIT_ICONS[i % BENEFIT_ICONS.length];
              return (
                <Reveal key={b} as="li" delay={i * 70}>
                  <div className={`${tile} flex items-center gap-5`}>
                    <span className="sr-icon h-14 w-14 flex-none rounded-2xl"><BenefitIcon className="h-7 w-7" /></span>
                    <p className="text-lg font-black leading-snug">{b}</p>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>
        {/* what holds for every product */}
        <Reveal delay={100}>
          <ul className="mt-5 grid gap-px overflow-hidden rounded-3xl bg-border/70 shadow-sm ring-1 ring-border/70 md:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "Your data stays yours", text: "Each business is kept separate, and people see only what their role allows." },
              { icon: Palette, title: "Your own brand", text: "It carries your business name and logo, in the browser and in your own apps." },
              { icon: PackageCheck, title: "Easy to start", text: howToGet },
            ].map((x) => (
              <li key={x.title} className="flex gap-4 bg-card px-6 py-4">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary"><x.icon className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block font-black leading-snug">{x.title}</span><span className="mt-1 block text-[15px] leading-relaxed text-muted-foreground">{x.text}</span></span>
              </li>
            ))}
          </ul>
        </Reveal>
      </Band>

      {show.included && (
        <Band id="included" {...at("included")} eyebrow="Works with" title="Better" accent="together." lead={howToGet}>
          {[
            { title: comesWithAll ? "Also in every workspace" : "What you also get", list: alsoGet.map(({ o, brought }) => ({ o, text: productShort(o.key, o.summary), tag: brought ? `Comes with ${name}` : "Included" })) },
            { title: "It can pass work to", list: connects.map(({ o, text }) => ({ o, text, tag: "Connects" })) },
          ].filter((g) => g.list.length > 0).map((g) => (
            <div key={g.title} className="mt-10 first:mt-0">
              <h3 className="mb-4 flex items-center gap-4 text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">{g.title}<span className="h-px flex-1 bg-border" aria-hidden /></h3>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.list.map(({ o, text, tag }, i) => (
                  <Reveal key={o.key} as="li" delay={i * 40}>
                    <Link href={productPath(o.key)} className={`${tile} flex items-start gap-4`}>
                      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-muted/60"><ProductLogo productKey={o.key} size={32} title={o.name} /></span>
                      <span className="min-w-0 flex-1"><span className="block font-black leading-snug group-hover:text-primary">{o.name}</span><span className="mt-1 block text-sm leading-snug text-muted-foreground">{text}</span><span className="mt-2.5 inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">{tag}</span></span>
                      <ArrowUpRight className="h-4 w-4 flex-none text-muted-foreground/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Link>
                  </Reveal>
                ))}
              </ul>
            </div>
          ))}
        </Band>
      )}

      {/* the questions look the same here as on every other page; this component also publishes them as structured data */}
      <FaqSection n={String(at("faq").n).padStart(2, "0")} tone={at("faq").tint ? "muted" : undefined} extra={faqs} limit={0} lead={`The things people ask before they start with ${name}.`} />

      <section className="border-t border-border/50 py-12">
        <div className="sr-container">
          <div className="grid gap-4 sm:grid-cols-2">
            {[{ p: prev, dir: "Previous product" }, { p: next, dir: "Next product" }].map(({ p, dir }, i) => (
              <Link key={dir} data-product-link href={productPath(p.key)} className={`${tile} flex items-center gap-4 ${i ? "sm:flex-row-reverse sm:text-right" : ""}`}>
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-muted/60"><ProductLogo productKey={p.key} size={38} title={p.name} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[11px] font-black uppercase tracking-wider text-primary">{dir}</span><span className="block text-lg font-black leading-snug">{p.name}</span><span className="block truncate text-sm text-muted-foreground">{productShort(p.key, p.summary)}</span></span>
                <ArrowRight className={`h-5 w-5 flex-none text-primary transition-transform ${i ? "rotate-180 group-hover:-translate-x-1" : "group-hover:translate-x-1"}`} />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
