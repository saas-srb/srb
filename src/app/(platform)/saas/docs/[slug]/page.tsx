import { article, breadcrumbList } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FEATURE_LISTS } from "@/lib/platform/saas/feature-lists";
import { ArrowRight, BookOpen, ChevronDown, Lightbulb } from "lucide-react";
import { DOCS, DOC_CATEGORIES, docBySlug } from "@/lib/platform/saas/docs";
import { TUTORIALS } from "@/lib/platform/saas/tutorials";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { screenFor } from "@/lib/platform/saas/screens";
import { CtaBand, HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import DeviceScene, { type SceneVariant } from "@/components/platform/saas/DeviceScene";
import DocsGuideSidebar from "@/components/platform/saas/DocsGuideSidebar";
import ScrollToTop from "@/components/platform/saas/product/ScrollToTop";
import Reveal from "@/components/platform/saas/Reveal";
import Icon from "@/components/platform/saas/Icon";
import { productKeyFromSlug, productPath } from "@/lib/platform/saas/product-routes";
import ProductLogo from "@/components/products/ProductLogo";

export const dynamic = "force-dynamic";
const slugOf = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function generateStaticParams() {
  return DOCS.map((g) => ({ slug: g.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = docBySlug((await params).slug);
  return g ? pageMeta({ path: `/docs/${g.slug}`, title: g.title, description: `${g.summary} A step-by-step ${g.category.toLowerCase()} guide from SelfRun AI, with the real screen.`, keywords: [g.title, g.category, `${g.category} guide`, "business software guide", "how to set up business software", "SaaS documentation"], tag: "Guide" }) : {};
}

export default async function DocArticle({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const g = docBySlug(slug);
  const productKey = productKeyFromSlug(slug);
  if (!g && productKey && productKey in FEATURE_LISTS) redirect(`/docs#${productKey}`);
  if (!g) notFound();
  const i = DOCS.indexOf(g);
  const next = DOCS[(i + 1) % DOCS.length];
  const prev = DOCS[(i + DOCS.length - 1) % DOCS.length];
  const modules = await getFeatureModules();
  const panel = modules.find((m) => m.key === g.panel);
  const related = DOCS.filter((x) => x.category === g.category && x.slug !== g.slug).slice(0, 3);
  const tutorial = TUTORIALS.find((t) => t.next.includes(g.slug));
  const variant = (i % 6) as SceneVariant;
  return (
    <>
      <JsonLd data={[
        article({ type: "TechArticle", path: `/docs/${g.slug}`, title: g.title, description: g.summary, date: "2026-01-01", author: "SelfRun AI", authorOrg: true, section: g.category }),
        breadcrumbList([{ name: "Home", path: "/" }, { name: "Documentation", path: "/docs" }, { name: g.title, path: `/docs/${g.slug}` }]),
      ]} />
      <PageHero art="docs" eyebrow={`${g.category} · ${g.readMinutes} min read`} title={g.title} lead={g.summary} photo="laptop-talk" shot={g.shot} shotName={g.title}>
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "All documentation", href: "/docs" }} />
      </PageHero>
      <ScrollToTop pageKey={g.slug} />
      <section className="sr-section">
        <div data-hop-target className="sr-container grid gap-12 lg:grid-cols-[300px_minmax(0,1fr)_220px]">
          <aside className="hidden lg:block" aria-label="All guides">
            <div className="sticky top-28">
              <DocsGuideSidebar key={g.category} groups={DOC_CATEGORIES.map((c) => ({ name: c.name, items: DOCS.filter((x) => x.category === c.name).map((x) => ({ slug: x.slug, title: x.title, readMinutes: x.readMinutes })) })).filter((c) => c.items.length)} activeSlug={g.slug} activeCategory={g.category} />
            </div>
          </aside>

          <details className="group rounded-2xl border border-border/60 bg-card shadow-sm lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-black"><span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />Browse all guides</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
            <div className="border-t border-border/60 p-2"><DocsGuideSidebar key={`m-${g.category}`} groups={DOC_CATEGORIES.map((c) => ({ name: c.name, items: DOCS.filter((x) => x.category === c.name).map((x) => ({ slug: x.slug, title: x.title, readMinutes: x.readMinutes })) })).filter((c) => c.items.length)} activeSlug={g.slug} activeCategory={g.category} /></div>
          </details>

          <article className="min-w-0 max-w-3xl">
            {screenFor(g.shot) && <Reveal className="mb-12"><DeviceScene screenKey={g.shot} name={g.title} variant={variant} priority /></Reveal>}
            <div className="space-y-12">
              {g.sections.map((s, n) => (
                <Reveal key={s.heading}>
                  <section id={slugOf(s.heading)} style={{ scrollMarginTop: 110 }}>
                    <h2 className="mb-4 flex items-center gap-3 text-2xl font-black tracking-tight"><span className="sr-circle h-8 w-8 text-sm">{n + 1}</span>{s.heading}</h2>
                    <div className="sr-prose">
                      {s.body?.map((p) => <p key={p}>{p}</p>)}
                      {s.list && <ul>{s.list.map((l) => <li key={l}>{l}</li>)}</ul>}
                    </div>
                    {s.shot && screenFor(s.shot) && <div className="mt-6"><DeviceScene screenKey={s.shot} name={s.heading} variant={((variant + n + 1) % 6) as SceneVariant} /></div>}
                    {s.tip && <div className="mt-5 flex gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 text-sm leading-relaxed"><Lightbulb className="mt-0.5 h-5 w-5 flex-none text-primary" /><span><b className="text-primary">Tip · </b>{s.tip}</span></div>}
                  </section>
                </Reveal>
              ))}
            </div>

            {(panel || tutorial) && (
              <div className="mt-14 grid gap-4 sm:grid-cols-2">
                {panel && (
                  <Link href={productPath(panel.key)} className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-muted/20 p-5 transition-all hover:border-primary/40">
                    <span className="sr-icon h-12 w-12 flex-none"><ProductLogo productKey={panel.key} size={36} title={panel.name} /></span>
                    <span><span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">Product reference</span><span className="block font-black">{panel.name}</span></span>
                    <ArrowRight className="ml-auto h-5 w-5 text-primary" />
                  </Link>
                )}
                {tutorial && (
                  <Link href={`/docs/walkthroughs/${tutorial.slug}`} className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-muted/20 p-5 transition-all hover:border-primary/40">
                    <span className="sr-icon h-12 w-12 flex-none"><Icon name="rocket" className="h-5 w-5" /></span>
                    <span><span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">Step-by-step walkthrough</span><span className="block font-black leading-snug">{tutorial.title}</span></span>
                    <ArrowRight className="ml-auto h-5 w-5 text-primary" />
                  </Link>
                )}
              </div>
            )}

            {related.length > 0 && (
              <div className="mt-14">
                <p className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">Related guides</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {related.map((x) => (
                    <Link key={x.slug} href={`/docs/${x.slug}`} className="rounded-2xl border border-border/60 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40">
                      <p className="font-bold leading-snug">{x.title}</p><p className="mt-1 text-xs text-muted-foreground">{x.readMinutes} min read</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-12 grid gap-3 sm:grid-cols-2">
              {[{ p: prev, d: "Previous guide" }, { p: next, d: "Next guide" }].map(({ p, d }, k) => (
                <Link key={d} href={`/docs/${p.slug}`} className={`group rounded-2xl border border-border/60 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 ${k ? "sm:text-right" : ""}`}>
                  <span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">{d}</span><span className="mt-1 block font-black leading-snug">{p.title}</span>
                </Link>
              ))}
            </div>
          </article>

          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-28 space-y-2 border-l pl-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">On this page</p>
              {g.sections.map((s) => <a key={s.heading} href={`#${slugOf(s.heading)}`} className="block text-[13px] leading-snug text-muted-foreground transition-colors hover:text-foreground">{s.heading}</a>)}
            </nav>
          </aside>
        </div>
      </section>
      <CtaBand title="Put this guide to work — free." lead="Every product and every feature is included in every plan, starting free forever." />
      <FaqSection topics={["Setup", "AI & automation", "Your brand"]} limit={5} />
    </>
  );
}
