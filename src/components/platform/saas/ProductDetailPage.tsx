import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowRight, Bot, BookOpen, Check, ChevronRight, GraduationCap, Layers, Map as MapIcon, Plug, ShieldCheck, Sparkles, Users, Wallet, Zap } from "lucide-react";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { FEATURE_LISTS, PANEL_VALUE, featureCount, featuresOf } from "@/lib/platform/saas/feature-lists";
import { PANEL_DETAIL } from "@/lib/platform/saas/panel-detail";
import { EXTRA_SCREENS } from "@/lib/platform/saas/site";
import { screenFor } from "@/lib/platform/saas/screens";
import { CtaBand, HeroCtas, PageHero, SectionHead } from "@/components/platform/saas/blocks";
import ProductLogo from "@/components/products/ProductLogo";
import Reveal from "@/components/platform/saas/Reveal";
import { productDocsPath, productKeyFromSlug, productPath, productSlugFor } from "@/lib/platform/saas/product-routes";
import { productShort } from "@/lib/platform/saas/product-short";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import { PRODUCT_AUDIENCE, PRODUCT_CATEGORY, PRODUCT_SEO } from "@/lib/platform/saas/product-seo";
import JsonLd from "@/components/platform/saas/JsonLd";
import { breadcrumbList, faqPage, howTo, softwareApplication, webPage } from "@/lib/platform/saas/jsonld";
import { PRODUCT_START } from "@/lib/platform/saas/product-start";
import { productFaqs } from "@/lib/platform/saas/product-faq";
import { DOCS } from "@/lib/platform/saas/docs";
import { TUTORIALS } from "@/lib/platform/saas/tutorials";
import ProductScrollNav from "@/components/platform/saas/product/ProductScrollNav";
import ProductFaqList from "@/components/platform/saas/ProductFaq";
import FeatureExplorer from "@/components/platform/saas/product/FeatureExplorer";
import ScrollToTop from "@/components/platform/saas/product/ScrollToTop";
import ScreenGallery from "@/components/platform/saas/product/ScreenGallery";

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

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "why", label: "Why use it" },
  { id: "features", label: "Features" },
  { id: "how", label: "How it works" },
  { id: "who", label: "Who uses it" },
  { id: "extras", label: "Automations & AI" },
  { id: "screens", label: "Screens" },
  { id: "walkthroughs", label: "Walkthroughs" },
  { id: "docs", label: "Docs" },
  { id: "faq", label: "Questions" },
];

/** Lower-cases the first letter of a phrase unless it starts an acronym (HR, CRM, SOP…). */
const soft = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** One band of the page: full width, numbered, with the site's centred heading (label, title, a line on what it is for), then the content. Bands alternate tints. */
const LABELS: Record<string, string> = { why: "Why use it", features: "Features", how: "How it works", who: "Who uses it", extras: "Automations & AI", screens: "Screens", walkthroughs: "Learn it", docs: "Documentation", more: "Keep exploring" };
function Band({ id, n, title, accent, lead, tint, children }: { id: string; n: string; title: React.ReactNode; accent?: string; lead?: React.ReactNode; tint?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className={`sr-section ${tint ? "bg-muted/10" : ""}`} style={{ scrollMarginTop: 140 }}>
      <div className="sr-container">
        <SectionHead n={n} center eyebrow={LABELS[id]} title={title} accent={accent} lead={lead} />
        {children}
      </div>
    </section>
  );
}

const tile = "group relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10";

export default async function ProductDetailPage({ productSlug }: { productSlug: string }) {
  const key = productSlug;
  const d = await load(key);
  if (!d) notFound();
  const { m, all, prev, next } = d;
  if (key !== productSlugFor(m.key)) permanentRedirect(productPath(m.key));
  const groups = FEATURE_LISTS[m.key] ?? [];
  const total = featureCount(m.key) || m.capabilities.length;
  const value = PANEL_VALUE[m.key];
  const detail = PANEL_DETAIL[m.key];
  const byKey = new Map(all.map((x) => [x.key, x]));
  const extras = (EXTRA_SCREENS[m.key] ?? []).filter((x) => screenFor(x.key));
  const slugOf = new Map(featuresOf(m.key).map((f) => [`${f.group}::${f.name}`, f.slug]));
  const explorerItems = groups.flatMap((g) => g.items.map((it) => { const slug = slugOf.get(`${g.title}::${it.name}`); return { name: it.name, text: it.text, group: g.title, href: slug ? productDocsPath(m.key, slug) : undefined }; }));
  const connects = (detail?.connects ?? []).flatMap((c) => { const o = byKey.get(c.panel); return o ? [{ o, text: c.text }] : []; });
  const guides = DOCS.filter((x) => x.panel === m.key);
  const tutorials = TUTORIALS.filter((t) => t.panel === m.key);
  const faqs = productFaqs(m, { groups, total, value, detail, connected: connects.map((c) => c.o.name), guides: [...tutorials.map((t) => t.title), ...guides.map((g) => g.title)].slice(0, 2) });
  const hasScreens = !!screenFor(m.key);
  const hasExtras = m.automations.length > 0 || !!detail?.ask?.length || connects.length > 0;
  const show: Record<string, boolean> = { why: !!value, how: !!detail, who: !!detail, extras: hasExtras, screens: hasScreens };
  const nav = SECTIONS.filter((s) => show[s.id] !== false);
  const numbered = nav.filter((x) => x.id !== "overview" && x.id !== "faq");
  const num = (id: string) => String(numbered.findIndex((x) => x.id === id) + 1).padStart(2, "0");
  const tintOf = (id: string) => numbered.findIndex((x) => x.id === id) % 2 === 0;
  const extraCols = [!!detail?.ask?.length, m.automations.length > 0, connects.length > 0].filter(Boolean).length;

  const seoKeywords = PRODUCT_SEO[m.key]?.keywords ?? [];
  const shots = [screenFor(m.key), ...extras.map((x) => screenFor(x.key))].filter((x): x is string => !!x);
  const tagline = (PRODUCT_SEO[m.key]?.title ?? "").split(": ")[1] ?? "";
  const ld = [
    softwareApplication({
      path: productPath(m.key), name: m.name, alternateName: m.name.replace(/^SelfRun\s+/i, ""), description: `${m.headline}. ${m.summary}`,
      subCategory: PRODUCT_CATEGORY[m.key], audience: PRODUCT_AUDIENCE[m.key], features: m.capabilities, keywords: seoKeywords, screenshots: shots,
      related: connects.map(({ o }) => ({ name: o.name, path: productPath(o.key) })),
    }),
    webPage({ path: productPath(m.key), name: `${m.name}: ${PRODUCT_SEO[m.key]?.title ?? m.headline}`, description: `${m.headline}. ${m.summary}`, about: m.name }),
    breadcrumbList([{ name: "Home", path: "/" }, { name: "Products", path: "/products" }, { name: m.name, path: productPath(m.key) }]),
    faqPage(faqs),
    ...(detail?.workflow.length ? [howTo({ path: productPath(m.key), name: `How ${m.name} works`, description: `${m.headline}. ${m.summary}`, steps: detail.workflow.map((w) => ({ name: w.title, text: w.text })) })] : []),
  ];

  const endDot = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
  const heroLead = (
    <>
      <span className="block">{endDot(m.summary)}</span>
      <span className="mt-3 block text-[0.95em]">
        {detail?.intro ? endDot(detail.intro) : ""}{value ? ` It takes the place of ${soft(value.replaces)}.` : ""}
      </span>
    </>
  );
  const heroNotes = ["Every feature included", ...(detail?.workflow.length ? [`${detail.workflow.length}-step workflow`] : []), "Included in every plan"];
  const glance = [
    { icon: <Layers className="h-5 w-5" />, q: "What it does", a: m.headline },
    detail && { icon: <Users className="h-5 w-5" />, q: "Who uses it", a: detail.audience.map((a) => a.who).join(", ") },
    value && { icon: <Wallet className="h-5 w-5" />, q: "What it takes the place of", a: value.replaces },
    { icon: <ShieldCheck className="h-5 w-5" />, q: "What it costs", a: "Included in every plan. Free to start, no card needed." },
  ].filter(Boolean) as { icon: React.ReactNode; q: string; a: string }[];

  return (
    <>
      <JsonLd data={ld} />
      <PageHero art={`product-${m.key}`} eyebrow={tagline || "Part of SelfRun AI"} title={m.name} lead={heroLead} notes={heroNotes} photo="analytics" shot={m.key} shotName={m.name}>
        <HeroCtas />
      </PageHero>

      <ScrollToTop pageKey={m.key} />
      <ProductScrollNav items={nav.map((x) => ({ id: x.id, label: x.label }))} name={m.name} />

      {/* overview */}
      <section id="overview" className="sr-section" style={{ scrollMarginTop: 140 }}>
        <div className="sr-container">
          <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/products" className="hover:text-primary">Products</Link><ChevronRight className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">{m.name}</span>
          </nav>
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
            <div>
              <p className="sr-eyebrow mb-3">Overview</p>
              <h2 className="text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">What is <span className="bg-gradient-to-r from-primary to-brand-accent bg-clip-text text-transparent">{m.name.replace(/^SelfRun\s+/i, "")}?</span></h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{detail?.intro ?? m.summary}</p>
              <p className="mt-5 rounded-2xl border border-primary/25 bg-primary/[0.05] p-4 text-sm leading-relaxed"><b>In short.</b> <span className="text-muted-foreground">{endDot(m.description)} {m.outcome}</span></p>
              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {m.capabilities.slice(0, 6).map((c) => <li key={c} className="flex gap-2.5 text-[15px] leading-snug"><span className="sr-circle mt-0.5 h-5 w-5 flex-none"><Check className="h-3 w-3" strokeWidth={3} /></span><span>{c}</span></li>)}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:-translate-y-0.5">Start free <ArrowRight className="h-4 w-4" /></Link>
                <a href="#walkthroughs" className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-bold transition-colors hover:border-primary/40 hover:text-primary">See a walkthrough</a>
              </div>
            </div>
            {screenFor(m.key) && (
              <Reveal>
                <figure className="relative">
                  <div className="sr-stage p-3 sm:p-5">
                    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl">
                      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-3.5 py-2.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" /><span className="ml-3 truncate rounded-full bg-background px-3 py-0.5 text-[11px] text-muted-foreground">{m.name}</span></div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={screenFor(m.key)!} alt={`${m.name}: a real screen`} width={1280} height={800} loading="eager" decoding="async" className="block h-auto w-full" />
                    </div>
                  </div>
                  <span className="absolute -bottom-3 left-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-background px-3.5 py-1.5 text-xs font-black text-emerald-600 shadow-lg"><Check className="h-3.5 w-3.5" strokeWidth={3} />Included in every plan</span>
                  <span className="absolute -top-3 right-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background px-3.5 py-1.5 text-xs font-black text-primary shadow-lg"><Sparkles className="h-3.5 w-3.5" />AI built in</span>
                  <figcaption className="mt-5 text-center text-xs text-muted-foreground">A real screen of {m.name}, captured in a demo workspace with sample data.</figcaption>
                </figure>
              </Reveal>
            )}
          </div>
          <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="At a glance">
            {glance.map((g, i) => (
              <Reveal key={g.q} as="li" delay={i * 60}>
                <div className="relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                  <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent" aria-hidden />
                  <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-accent text-white shadow-md shadow-primary/25">{g.icon}</span>
                  <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{g.q}</p>
                  <p className="mt-1 text-[15px] font-bold leading-snug">{g.a}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {value && (
        <Band id="why" n={num("why")} tint={tintOf("why")} title={`Why teams choose ${m.name}`} lead={`${m.name} takes the place of ${soft(value.replaces)}, and it works together with the other SelfRun AI products you switch on.`}>
          <div className="grid gap-5 lg:grid-cols-[1fr_1.25fr]">
            <Reveal>
              <div className="sr-band relative flex h-full flex-col justify-between gap-8 rounded-3xl p-8 shadow-xl shadow-primary/25">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Instead of</p>
                  <p className="mt-2 text-2xl font-black leading-snug text-white/70 line-through decoration-rose-300/80 decoration-[3px]">{value.replaces}</p>
                  <ArrowRight className="my-4 h-7 w-7 rotate-90 text-white/80" />
                  <div className="flex items-center gap-3"><span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/30 bg-white/95 shadow-lg"><ProductLogo productKey={m.key} size={38} title={m.name} /></span><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Use</p><p className="text-2xl font-black leading-tight text-white">{m.name}</p></div></div>
                </div>
                <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20"><p className="text-xs font-bold uppercase tracking-widest text-white/70">The result</p><p className="mt-1 font-bold leading-snug text-white">{m.outcome}</p></div>
              </div>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              {value.benefits.map((b, i) => (
                <Reveal key={b} delay={i * 70}>
                  <div className={`${tile} h-full`}>
                    <span className="pointer-events-none absolute -right-2 -top-5 select-none bg-gradient-to-b from-primary/25 to-transparent bg-clip-text text-8xl font-black leading-none text-transparent" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                    <span className="sr-circle relative mb-4 h-9 w-9"><Check className="h-4 w-4" strokeWidth={3} /></span>
                    <p className="relative text-lg font-bold leading-snug">{b}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Band>
      )}

      <Band id="features" n={num("features")} tint={tintOf("features")} title="Everything you can do" lead="Search, or pick a group. Open any feature to read its full guide. Every feature is included in every plan.">
        <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-8">
              <FeatureExplorer productName={m.name} items={explorerItems} groups={groups.map((g) => ({ title: g.title, count: g.items.length }))} />
            
        </div>
      </Band>

      {detail && (
        <Band id="how" n={num("how")} tint={tintOf("how")} title="From start to" accent="finish." lead={detail.intro}>
          <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {detail.workflow.map((w, i) => (
              <Reveal key={w.title} as="li" delay={i * 90} className="relative lg:px-2.5">
                <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-brand-accent opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
                  <span className="pointer-events-none absolute -right-2 -top-5 select-none bg-gradient-to-b from-primary/20 to-transparent bg-clip-text text-8xl font-black leading-none text-transparent" aria-hidden>{i + 1}</span>
                  <span className="sr-circle relative mb-5 h-12 w-12 text-lg font-black shadow-lg shadow-primary/30">{i + 1}</span>
                  <h3 className="relative text-xl font-black leading-snug tracking-tight">{w.title}</h3>
                  <p className="relative mt-2 text-[15px] leading-relaxed text-muted-foreground">{w.text}</p>
                </div>
                {i < detail.workflow.length - 1 && <span className="pointer-events-none absolute -right-3.5 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background text-primary shadow-md lg:flex" aria-hidden><ArrowRight className="h-4 w-4" /></span>}
              </Reveal>
            ))}
          </ol>
        </Band>
      )}

      {detail && (
        <Band id="who" n={num("who")} tint={tintOf("who")} title={`Who uses ${m.name}`} lead="Everyone sees only what their role allows, so each person gets a screen that fits their job.">
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {detail.audience.map((a, i) => (
              <Reveal key={a.who} as="li" delay={i * 70}>
                <div className="group h-full rounded-3xl border border-border/60 bg-card p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
                  <span className="sr-icon mx-auto mb-4 h-14 w-14 rounded-2xl transition-transform group-hover:scale-110"><Users className="h-6 w-6" /></span>
                  <h3 className="text-lg font-black leading-snug">{a.who}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.does}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </Band>
      )}

      {hasExtras && (
        <Band id="extras" n={num("extras")} tint={tintOf("extras")} title="It works while" accent="you don't." lead="Questions you can ask in plain English, things that happen on their own, and the products it can pass work to.">
          <div className={`grid gap-5 ${extraCols === 1 ? "mx-auto max-w-2xl" : extraCols === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
            {detail?.ask?.length ? (
              <Reveal>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <h3 className="mb-4 flex items-center gap-3 text-lg font-black"><span className="sr-icon h-11 w-11 rounded-xl"><Bot className="h-5 w-5" /></span>Ask in plain English</h3>
                  <ul className="space-y-2.5">{detail.ask.map((q) => <li key={q} className="rounded-2xl rounded-tl-sm bg-primary/[0.07] px-4 py-3 text-[15px] font-semibold leading-snug">“{q}”</li>)}</ul>
                </div>
              </Reveal>
            ) : null}
            {m.automations.length ? (
              <Reveal delay={70}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <h3 className="mb-4 flex items-center gap-3 text-lg font-black"><span className="sr-icon h-11 w-11 rounded-xl"><Zap className="h-5 w-5" /></span>Runs by itself</h3>
                  <ul className="space-y-2.5">
                    {m.automations.map((a) => <li key={a} className="flex items-start gap-3 text-[15px] font-semibold leading-snug"><span className="relative mt-1.5 flex h-2.5 w-2.5 flex-none"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>{a}</li>)}
                  </ul>
                  <p className="mt-4 text-sm text-muted-foreground">Build your own in <Link href={`${productPath("workspace")}#features`} className="font-bold text-primary underline underline-offset-2">Workspace → Automations</Link>.</p>
                </div>
              </Reveal>
            ) : null}
            {connects.length ? (
              <Reveal delay={140}>
                <div className="h-full rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
                  <h3 className="mb-1 flex items-center gap-3 text-lg font-black"><span className="sr-icon h-11 w-11 rounded-xl"><Plug className="h-5 w-5" /></span>Works with</h3>
                  <p className="mb-4 mt-2 text-sm text-muted-foreground">{m.name} works fully on its own. These are the other products it can pass work to, if you want it to.</p>
                  <ul className="space-y-2.5">
                    {connects.map(({ o, text }) => (
                      <li key={o.key}>
                        <Link href={productPath(o.key)} className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-background p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border/60 bg-card shadow-sm"><ProductLogo productKey={o.key} size={30} title={o.name} /></span>
                          <span className="min-w-0"><span className="block text-sm font-black leading-snug group-hover:text-primary">{o.name}</span><span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{text}</span></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ) : null}
          </div>
        </Band>
      )}

      {hasScreens && (
        <Band id="screens" n={num("screens")} tint={tintOf("screens")} title={`${m.name}, as your team sees it`} lead="Real screens of the live product, captured in a demo workspace with sample data.">
                <ScreenGallery
                  name={m.name}
                  shots={[{ key: m.key, title: "Dashboard", src: screenFor(m.key)! }, ...extras.map((x) => ({ key: x.key, title: x.title, src: screenFor(x.key)! }))]}
                />
              
        </Band>
      )}

      <Band id="walkthroughs" n={num("walkthroughs")} tint={tintOf("walkthroughs")} title={`Learn ${m.name} step by step`} lead="Learn by doing: start with the three steps, then follow a walkthrough for one job at a time, or take the quick tour of how a job moves through the product.">
              <h3 className="mb-1 text-lg font-black">Your first three steps</h3>
              <p className="mb-4 text-sm text-muted-foreground">First register free and switch on {m.name} in your business setup. Then:</p>
              <ol className="mb-10 grid gap-4 sm:grid-cols-3">
                {(PRODUCT_START[m.key] ?? [
                  { t: "Register free", x: "Create your workspace with your work email. No card needed." },
                  { t: `Switch on ${m.name}`, x: "Switch it on in your business setup, then invite your team and give each person a role." },
                  { t: "Follow a walkthrough", x: tutorials[0] ? `Start with “${tutorials[0].title}” below.` : "Then open its guides in the Docs section." },
                ]).map((st, i) => (
                  <Reveal key={st.t} as="li" delay={i * 70} className={`${tile}`}>
                    <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-sm font-black text-white shadow-lg shadow-primary/25">{i + 1}</span>
                    <p className="font-black leading-snug">{st.t}</p><p className="mt-1 text-[15px] text-muted-foreground">{st.x}</p>
                  </Reveal>
                ))}
              </ol>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black"><GraduationCap className="h-5 w-5 text-primary" />{tutorials.length === 1 ? `The walkthrough for ${m.name}` : `Walkthroughs for ${m.name}`}</h3>
              {tutorials.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {tutorials.map((t) => (
                    <Link key={t.slug} href={`/docs/walkthroughs/${t.slug}`} className="group flex flex-col rounded-3xl border border-primary/30 bg-gradient-to-br from-card to-primary/[0.06] p-6 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl hover:shadow-primary/10">
                      <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-black uppercase tracking-wider text-primary-foreground"><GraduationCap className="h-3.5 w-3.5" />Walkthrough</span>
                      <span className="text-xl font-black leading-snug">{t.title}</span>
                      <span className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{t.summary}</span>
                      <span className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground"><span>{t.steps.length} steps</span><span>{t.minutes} min</span><span>{t.level}</span><span className="ml-auto font-bold text-primary">Start the walkthrough <ArrowRight className="ml-1 inline h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-[15px] text-muted-foreground">There is no step-by-step walkthrough for {m.name} yet. Its guides are in the next section, and every feature has its own guide.</p>
              )}
              {detail && (
                <>
                  <h3 className="mb-1 mt-12 flex items-center gap-2 text-lg font-black"><MapIcon className="h-5 w-5 text-primary" />Quick tour: {m.name} in {detail.workflow.length} steps</h3>
                  <p className="mb-4 text-sm text-muted-foreground">How a job moves through {m.name}, from the first step to the last. Try it in the product after you register.</p>
                  <ol className="grid gap-3 sm:grid-cols-2">
                    {detail.workflow.map((w, i) => (
                      <li key={w.title} className="flex gap-4 rounded-2xl border border-border/60 bg-background p-5 shadow-sm">
                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">{i + 1}</span>
                        <div className="min-w-0"><span className="mb-1 inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground">Quick tour</span><p className="font-black leading-snug">{w.title}</p><p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{w.text}</p></div>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 text-sm"><Link href="/signup" className="font-bold text-primary hover:underline">Start the tour in the product, free <ArrowRight className="ml-1 inline h-4 w-4" /></Link></p>
                </>
              )}
              <p className="mt-8 text-sm"><Link href="/docs#walkthroughs" className="font-bold text-primary hover:underline">All walkthroughs for every product <ArrowRight className="ml-1 inline h-4 w-4" /></Link></p>
            
      </Band>

      <Band id="docs" n={num("docs")} tint={tintOf("docs")} title={`${m.name} documentation`} lead="Guides and references you can read any time: what each part does, how to set it up and how it fits with the rest.">
              <div className="grid gap-4 md:grid-cols-2">
                {guides.map((g) => (
                  <Link key={g.slug} href={`/docs/${g.slug}`} className={`${tile} flex flex-col`}>
                    <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-black uppercase tracking-wider text-foreground"><BookOpen className="h-3.5 w-3.5" />Guide</span>
                    <span className="text-xl font-black leading-snug">{g.title}</span>
                    <span className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{g.summary}</span>
                    <span className="mt-4 flex items-center gap-4 text-sm font-semibold text-muted-foreground"><span>{g.readMinutes} min read</span><span className="ml-auto font-bold text-primary">Read the guide <ArrowRight className="ml-1 inline h-4 w-4 transition-transform group-hover:translate-x-1" /></span></span>
                  </Link>
                ))}
                {total > 0 && (
                  <a href="#features" className={`${tile} flex flex-col`}>
                    <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-black uppercase tracking-wider text-foreground"><Layers className="h-3.5 w-3.5" />Feature guides</span>
                    <span className="text-xl font-black leading-snug">A guide for every feature</span>
                    <span className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">Every feature of {m.name} has its own guide. Search the features above and open the one you need.</span>
                    <span className="mt-4 text-sm font-bold text-primary">See the features <ArrowRight className="ml-1 inline h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                  </a>
                )}
                <Link href={`/docs#${m.key}`} className="group flex flex-col justify-center rounded-3xl border border-dashed border-primary/40 bg-primary/[0.04] p-6 transition-colors hover:bg-primary/[0.08]">
                  <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-black uppercase tracking-wider text-primary-foreground"><BookOpen className="h-3.5 w-3.5" />Documentation</span>
                  <span className="text-xl font-black leading-snug">All {m.name} documentation</span>
                  <span className="mt-1.5 text-[15px] text-muted-foreground">Every guide for {m.name} in one place, in the documentation.</span>
                  <span className="mt-4 text-sm font-bold text-primary">Open the docs <ArrowRight className="ml-1 inline h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                </Link>
              </div>
            
      </Band>

      <section className="sr-section border-t border-border/50 bg-muted/10">
        <div className="sr-container">
          <p className="mb-6 text-center text-xs font-black uppercase tracking-[0.2em] text-primary">Keep exploring</p>
          <div className="grid gap-4 sm:grid-cols-2">
                {[{ p: prev, dir: "Previous product" }, { p: next, dir: "Next product" }].map(({ p, dir }, i) => (
                  <Link key={dir} data-product-link href={productPath(p.key)} className={`group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card to-primary/[0.06] p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 ${i ? "sm:flex-row-reverse sm:text-right" : ""}`}>
                    <span className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl border border-border/60 bg-background shadow-sm transition-transform group-hover:scale-105"><ProductLogo productKey={p.key} size={44} title={p.name} /></span>
                    <span className="min-w-0 flex-1"><span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-primary">{dir}</span><span className="mt-1 block text-lg font-black leading-snug">{p.name}</span><span className="block truncate text-sm text-muted-foreground">{productShort(p.key, p.summary)}</span></span>
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform"><ArrowRight className={`h-5 w-5 ${i ? "group-hover:translate-x-0.5" : "rotate-180 group-hover:-translate-x-0.5"}`} /></span>
                  </Link>
                ))}
              </div>
        </div>
      </section>

      <CtaBand title={`Run ${m.name}, and every other product, free.`} lead="Every feature is included in every plan. Start free, no card needed." />

      {/* questions: the last thing on the page, just above the footer */}
      <section id="faq" className="scroll-mt-36 border-t border-border/50 bg-muted/30 py-14 lg:py-20">
        <div className="sr-container max-w-4xl">
          <div className="mb-8 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">Questions</p>
            <h2 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl">Questions about {m.name}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">What people ask before they start, answered from what the product really does today.</p>
          </div>
          <ProductFaqList items={faqs} />
        </div>
      </section>
    </>
  );
}
