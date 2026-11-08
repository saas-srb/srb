import { breadcrumbList, howTo, webPage } from "@/lib/platform/saas/jsonld";
import JsonLd from "@/components/platform/saas/JsonLd";
import { pageMeta } from "@/lib/platform/saas/seo-meta";
import FaqSection from "@/components/platform/saas/FaqSection";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Lightbulb, Target } from "lucide-react";
import { TUTORIALS, tutorialBySlug } from "@/lib/platform/saas/tutorials";
import { docBySlug } from "@/lib/platform/saas/docs";
import { screenFor } from "@/lib/platform/saas/screens";
import { CtaBand, HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import DeviceScene, { type SceneVariant } from "@/components/platform/saas/DeviceScene";
import Reveal from "@/components/platform/saas/Reveal";

export const dynamic = "force-dynamic";
export function generateStaticParams() {
  return TUTORIALS.map((t) => ({ slug: t.slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = tutorialBySlug((await params).slug);
  return t ? pageMeta({ path: `/docs/walkthroughs/${t.slug}`, title: `${t.title}: Step-by-Step Walkthrough`, description: `${t.summary} A ${t.minutes}-minute walkthrough in ${t.steps.length} steps, with the real screen beside each step.`, keywords: [t.title, `how to ${t.title.toLowerCase()}`, `${t.title.toLowerCase()} tutorial`, "step by step walkthrough", "business software tutorial", "beginner guide to business software"], tag: "Walkthrough" }) : {};
}

export default async function WalkthroughPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = tutorialBySlug((await params).slug);
  if (!t) notFound();
  const i = TUTORIALS.indexOf(t);
  const next = TUTORIALS[(i + 1) % TUTORIALS.length];
  const guides = t.next.map((s) => docBySlug(s)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <>
    <JsonLd data={[
      howTo({ path: `/docs/walkthroughs/${t.slug}`, name: t.title, description: t.summary, totalMinutes: t.minutes, steps: t.steps.map((st) => ({ name: st.title, text: st.text })) }),
      webPage({ path: `/docs/walkthroughs/${t.slug}`, name: t.title, description: t.summary }),
      breadcrumbList([{ name: "Home", path: "/" }, { name: "Documentation", path: "/docs" }, { name: "Walkthroughs", path: "/docs#walkthroughs" }, { name: t.title, path: `/docs/walkthroughs/${t.slug}` }]),
    ]} />
      <PageHero art="docs" eyebrow={`Walkthrough · ${t.level}`} title={t.title} lead={t.summary} photo="team-work" shot={t.shot} shotName={t.title} chip={{ title: `${t.steps.length} steps`, text: `About ${t.minutes} minutes` }}>
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "All documentation", href: "/docs#walkthroughs" }} />
      </PageHero>

      <section className="sr-section">
        <div className="sr-container max-w-5xl">
          <Link href="/docs#walkthroughs" className="sr-link mb-8"><ArrowLeft className="h-4 w-4" /> All walkthroughs</Link>
          <div className="mb-14 flex flex-wrap items-center gap-4 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-brand-accent/[0.06] p-6">
            <span className="sr-circle h-12 w-12 flex-none"><Target className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-widest text-primary">You will have</p><p className="text-lg font-black leading-snug">{t.youWillHave}</p></div>
            <span className="flex items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-bold"><Clock className="h-4 w-4 text-primary" />{t.minutes} min</span>
          </div>

          <ol className="space-y-20">
            {t.steps.map((s, n) => (
              <li key={s.title} className="relative">
                <Reveal>
                  <div className={`grid items-center gap-10 ${s.shot && screenFor(s.shot) ? "lg:grid-cols-[0.8fr_1.2fr]" : ""}`}>
                    <div className={n % 2 && s.shot ? "lg:order-2" : ""}>
                      <span className="sr-circle mb-4 h-12 w-12 text-lg font-black shadow-lg shadow-primary/25">{n + 1}</span>
                      <h2 className="mb-3 text-2xl font-black tracking-tight sm:text-3xl">{s.title}</h2>
                      <p className="sr-lead">{s.text}</p>
                      {s.tip && <div className="mt-5 flex gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 text-sm leading-relaxed"><Lightbulb className="mt-0.5 h-5 w-5 flex-none text-primary" /><span><b className="text-primary">Tip · </b>{s.tip}</span></div>}
                    </div>
                    {s.shot && screenFor(s.shot) && <div className={n % 2 ? "lg:order-1" : ""}><DeviceScene screenKey={s.shot} name={s.title} variant={((i + n) % 6) as SceneVariant} /></div>}
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>

          {guides.length > 0 && (
            <div className="mt-20">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">Go deeper</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {guides.map((g) => <Link key={g.slug} href={`/docs/${g.slug}`} className="rounded-2xl border border-border/60 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40"><p className="font-black leading-snug">{g.title}</p><p className="mt-1 text-xs text-muted-foreground">{g.readMinutes} min read</p></Link>)}
              </div>
            </div>
          )}
          <Link href={`/docs/walkthroughs/${next.slug}`} className="group mt-12 flex items-center justify-between gap-4 rounded-3xl border border-border/60 bg-muted/20 p-6 transition-all hover:border-primary/40">
            <span><span className="block text-xs font-bold uppercase tracking-widest text-muted-foreground">Next walkthrough</span><span className="block text-xl font-black">{next.title}</span></span>
            <ArrowRight className="h-6 w-6 flex-none text-primary" />
          </Link>
        </div>
      </section>
      <CtaBand />
      <FaqSection topics={["Setup", "General"]} limit={5} />
    </>
  );
}
