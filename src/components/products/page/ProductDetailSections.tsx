import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, Cog, Sparkles, Target, TrendingUp, Users, XCircle } from "lucide-react";
import FAQAccordion from "@/components/sections/FAQAccordion";
import DetailHeading from "@/components/products/page/DetailHeading";
import Reveal from "@/components/products/page/Reveal";
import ProductTour from "@/components/products/page/ProductTour";
import ProductLogo from "@/components/products/ProductLogo";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import { neighbours, pageContent, productHref, relatedProducts, valueLine, type DetailSectionId, type StoredProduct } from "@/lib/products/shared";

/**
 * The sections of a product page, in the visual language of the service detail pages (`/services/<slug>`):
 * `py-24 sm:py-32` bands that alternate `bg-background` / `bg-muted/10`, an h2 + lead paragraph heading,
 * `rounded-2xl border bg-muted/20` cards with a `bg-primary/10` icon tile, the same fade-up motion.
 */
type Text = Record<string, string>;
type Tone = "default" | "muted";
type Tones = Partial<Record<DetailSectionId, Tone>>;

const CARD = "rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 hover:bg-muted/40 transition-all duration-300";
const TILE = "flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-primary/10";
const PROBLEM_ICONS = ["AlertTriangle", "Clock", "Shuffle", "Eye", "Puzzle", "ShieldAlert", "Search", "Layers"];

function Section({ id, tone = "default", children }: { id?: string; tone?: Tone; children: React.ReactNode }) {
  return (
    <section id={id} className={`relative scroll-mt-24 py-24 sm:py-32 ${tone === "muted" ? "bg-muted/10" : "bg-background"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">{children}</div>
    </section>
  );
}

// ── The problem it solves ────────────────────────────────────────────────

/** Column layout for 4-6 problem cards, so the last row is never a lone card. */
const problemGrid = (n: number) => (n === 4 ? "sm:grid-cols-2" : n === 5 ? "sm:grid-cols-2 lg:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-3");
const problemSpan = (n: number, i: number) => (n === 5 ? (i < 3 ? "lg:col-span-2" : "lg:col-span-3") : "");

export function ProblemSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const c = pageContent(product);
  if (!c.problem && !c.problems.length && !c.problemIntro) return null;
  const title = text["products.detail.problem.title"];
  const n = c.problems.length;
  // Records without the new fields: the single statement, as before.
  const lead = c.problemIntro || (n ? "" : c.problem);
  return (
    <Section id="problem" tone={tones.problem}>
      <DetailHeading eyebrow={product.shortName || product.name} title={title} description={lead} />
      {n > 0 && (
        <ul className={`grid grid-cols-1 gap-5 ${problemGrid(n)}`} data-problem-cards>
          {c.problems.map((p, i) => {
            const Icon = resolveIcon(p.icon || PROBLEM_ICONS[i % PROBLEM_ICONS.length]);
            return (
              <li key={p.title} className={problemSpan(n, i)} data-problem-card>
                <Reveal delay={(i % 3) * 0.07} className="h-full">
                  <div className={`${CARD} h-full p-6`}>
                    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10">
                      <Icon className="h-5 w-5 text-rose-500" aria-hidden="true" />
                    </span>
                    <h3 className="mb-2 font-bold leading-snug text-foreground">{p.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** "Without it / With it": before-and-after pairs that lead into the solution. */
export function CompareSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { beforeAfter } = pageContent(product);
  if (!beforeAfter.length) return null;
  return (
    <Section id="compare" tone={tones.compare}>
      <DetailHeading title={text["products.detail.compare.title"]} description={text["products.detail.compare.description"]} />
      <ul className="space-y-4" data-compare>
        {beforeAfter.map((pair, i) => (
          <li key={pair.before} data-compare-row>
            <Reveal delay={(i % 4) * 0.06}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 sm:p-6">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-500">
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    {text["products.detail.compare.before"]}
                  </p>
                  <p className="text-sm leading-relaxed text-foreground/90 sm:text-base">{pair.before}</p>
                </div>
                <span className="flex items-center justify-center" aria-hidden="true">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-white shadow-lg shadow-primary/20">
                    <ArrowRight className="hidden h-4 w-4 md:block" />
                    <ArrowDown className="h-4 w-4 md:hidden" />
                  </span>
                </span>
                <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6">
                  <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {text["products.detail.compare.after"]}
                  </p>
                  <p className="text-sm font-medium leading-relaxed text-foreground sm:text-base">{pair.after}</p>
                </div>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── The solution ─────────────────────────────────────────────────────────

/** Real screenshots, when the product has any. Local files go through next/image (lazy, responsive); remote CMS URLs use a plain lazy <img>. */
function Screenshots({ product, text }: { product: StoredProduct; text: Text }) {
  const shots = product.screenshots ?? [];
  if (!shots.length) return null;
  return (
    <div className="mt-16">
      <h3 className="mb-6 text-sm font-bold uppercase tracking-wider text-primary">{text["products.detail.screenshots"]}</h3>
      <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {shots.map((s) => (
          <li key={s.src}>
            <figure className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xl">
              {s.src.startsWith("/") ? (
                <Image src={s.src} alt={s.alt || s.caption || product.name} width={1440} height={900} sizes="(min-width: 1024px) 560px, 100vw" loading="lazy" className="h-auto w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- CMS-authored image on any host
                <img src={s.src} alt={s.alt || s.caption || product.name} loading="lazy" decoding="async" className="h-auto w-full" />
              )}
              {s.caption && <figcaption className="border-t border-border/60 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">{s.caption}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What it does (the overview, like a service's course overview) followed by the interactive preview and any screenshots. */
export function OverviewSection({ product, text, mockupText, tones }: { product: StoredProduct; text: Text; mockupText: Text; tones: Tones }) {
  const c = pageContent(product);
  const hasScreens = product.screens.length > 0;
  if (!c.overview && !c.purpose && !hasScreens && !product.screenshots?.length) return null;
  return (
    <Section id="overview" tone={tones.overview}>
      {(c.overview || c.purpose) && (
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <h2 className="mb-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{text["products.detail.whatItDoes"]}</h2>
            <div className="space-y-5">
              {c.overview.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="text-lg leading-8 text-muted-foreground">{para}</p>
              ))}
            </div>
          </Reveal>
          {c.purpose && (
            <Reveal delay={0.1} className="lg:col-span-5">
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-6 sm:p-8">
                <span className={`${TILE} mb-4`}>
                  <Target className="h-5 w-5 text-primary" aria-hidden="true" />
                </span>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">{text["products.detail.purpose"]}</p>
                <p className="text-lg font-medium leading-relaxed text-foreground">{c.purpose}</p>
              </div>
            </Reveal>
          )}
        </div>
      )}
      {hasScreens && (
        <div id="tour" className={`scroll-mt-24 ${c.overview || c.purpose ? "mt-20" : ""}`}>
          <DetailHeading title={text["products.detail.tour"]} description={text["products.detail.tourDescription"]} />
          <Reveal>
            <ProductTour product={product} mockupText={mockupText} />
          </Reveal>
        </div>
      )}
      <Screenshots product={product} text={text} />
    </Section>
  );
}

// ── Features, AI, automation ─────────────────────────────────────────────

export function FeaturesSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { features } = pageContent(product);
  if (!features.length) return null;
  return (
    <Section id="features" tone={tones.features}>
      <DetailHeading title={text["products.detail.features"]} description={text["products.detail.featuresDescription"]} />
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => {
          const Icon = resolveIcon(f.icon || "CheckCircle2");
          return (
            <li key={f.title}>
              <Reveal delay={(i % 3) * 0.08} className="h-full">
                <div className="h-full rounded-2xl border border-border/50 bg-muted/20 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:bg-muted/40 motion-reduce:hover:translate-y-0">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="mb-2 font-bold leading-snug text-foreground">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The AI in and around the product, as one highlighted product. A product with no AI of its own says so and names what surrounds it. */
export function AiSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { ai } = pageContent(product);
  if (!ai.length) return null;
  return (
    <Section id="ai" tone={tones.ai}>
      <Reveal>
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-6 shadow-xl shadow-primary/5 sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
          <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {text["products.card.ai"]}
              </span>
              <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{text["products.detail.ai"]}</h2>
              <p className="text-lg leading-8 text-muted-foreground">{text["products.detail.aiDescription"]}</p>
            </div>
            <ul className="grid grid-cols-1 gap-4 lg:col-span-8">
              {ai.map((f) => {
                const Icon = resolveIcon(f.icon || "Sparkles");
                return (
                  <li key={f.title} className="flex gap-4 rounded-2xl border border-border/50 bg-background/70 p-5 backdrop-blur-md sm:p-6">
                    <span className={TILE}>
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="mb-1.5 font-bold leading-snug text-foreground">{f.title}</h3>
                      {f.description && <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

/** Each workflow as a numbered flow: left to right on wide screens, top to bottom on narrow ones. */
export function AutomationSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { workflows } = pageContent(product);
  if (!workflows.length) return null;
  return (
    <Section id="automation" tone={tones.automation}>
      <DetailHeading title={text["products.detail.automation"]} description={text["products.detail.automationDescription"]} />
      <div className="space-y-6">
        {workflows.map((w, i) => (
          <Reveal key={w.title} delay={(i % 2) * 0.06}>
            <div className="rounded-3xl border border-border/50 bg-muted/20 p-6 sm:p-8">
              <div className="mb-8 flex items-start gap-4">
                <span className={TILE}>
                  <Cog className="h-5 w-5 text-primary" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{w.title}</h3>
                  {w.description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{w.description}</p>}
                </div>
              </div>
              {w.steps.length > 0 && (
                <ol className="grid gap-8 lg:grid-flow-col lg:auto-cols-fr lg:gap-6" aria-label={text["products.detail.steps"]}>
                  {w.steps.map((s, j) => (
                    <li key={j} className="relative pl-14 lg:pl-0 lg:pt-14">
                      <span className="absolute left-0 top-0 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-accent text-sm font-bold text-white shadow-lg shadow-primary/20">{j + 1}</span>
                      {j < w.steps.length - 1 && (
                        <span className="absolute left-5 top-10 -bottom-8 w-px bg-gradient-to-b from-primary/50 to-border lg:bottom-auto lg:left-10 lg:right-[-1.5rem] lg:top-5 lg:h-px lg:w-auto lg:bg-gradient-to-r" aria-hidden="true" />
                      )}
                      <p className="text-sm leading-relaxed text-foreground/90">{s}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── Use cases, outcome, audience ─────────────────────────────────────────

export function UseCasesSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { useCases, scenarios } = pageContent(product);
  if (!useCases.length && !scenarios.length) return null;
  return (
    <Section id="use-cases" tone={tones.useCases}>
      <DetailHeading title={text["products.detail.useCases"]} description={text["products.detail.useCasesDescription"]} />
      {useCases.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {useCases.map((u, i) => {
            const Icon = resolveIcon(u.icon || "Target");
            return (
              <li key={u.title}>
                <Reveal delay={(i % 2) * 0.06} className="h-full">
                  <div className={`${CARD} flex h-full gap-4 p-6`}>
                    <span className={TILE}>
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="mb-1.5 font-bold leading-snug text-foreground">{u.title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">{u.description}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      )}
      {scenarios.length > 0 && (
        <Reveal className="mt-12">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-primary">{text["products.detail.scenarios"]}</h3>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scenarios.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-sm text-foreground/90">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-primary" aria-hidden="true" />
                {s}
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </Section>
  );
}

export function BenefitsSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { benefits, outcome } = pageContent(product);
  if (!benefits.length && !outcome) return null;
  return (
    <Section id="benefits" tone={tones.benefits}>
      <DetailHeading title={text["products.detail.benefits"]} description={text["products.detail.benefitsDescription"]} />
      {outcome && (
        <Reveal className="mb-8">
          <div className="flex items-start gap-4 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-secondary/10 p-6 sm:p-8">
            <span className={TILE}>
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <p className="text-lg font-medium leading-relaxed text-foreground">{outcome}</p>
          </div>
        </Reveal>
      )}
      {benefits.length > 0 && (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <li key={b.title}>
              <Reveal delay={(i % 4) * 0.06} className="h-full">
                <div className={`${CARD} h-full p-6`}>
                  <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="mb-1.5 font-bold leading-snug text-foreground">{b.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{b.description}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function WhoForSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { audience } = pageContent(product);
  if (!audience && !product.targetDepartments.length && !product.targetUsers.length) return null;
  const chips = (items: string[]) => (
    <ul className="flex flex-wrap gap-2">
      {items.map((d) => (
        <li key={d} className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-sm font-semibold text-foreground">
          {d}
        </li>
      ))}
    </ul>
  );
  return (
    <Section id="audience" tone={tones.audience}>
      <DetailHeading title={text["products.detail.whoFor"]} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {audience && (
          <Reveal className="lg:col-span-6">
            <div className="flex items-start gap-4">
              <span className={TILE}>
                <Users className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <p className="text-lg leading-8 text-muted-foreground">{audience}</p>
            </div>
          </Reveal>
        )}
        <Reveal delay={0.1} className={audience ? "space-y-6 lg:col-span-6" : "space-y-6 lg:col-span-12"}>
          {product.targetDepartments.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">{text["products.detail.departments"]}</h3>
              {chips(product.targetDepartments)}
            </div>
          )}
          {product.targetUsers.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">{text["products.detail.users"]}</h3>
              {chips(product.targetUsers)}
            </div>
          )}
        </Reveal>
      </div>
    </Section>
  );
}

// ── Connections, FAQ, related ────────────────────────────────────────────

/** The product at the centre of a rail, the things it connects to hanging off it. */
export function IntegrationsSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { integrations } = pageContent(product);
  if (!integrations.length) return null;
  return (
    <Section id="integrations" tone={tones.integrations}>
      <DetailHeading title={text["products.detail.integrations"]} description={text["products.detail.integrationsDescription"]} />
      <Reveal>
        <div className="mx-auto mb-6 flex w-fit items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-bold text-foreground">
          <ProductLogo productKey={product.slug} size={42} title={product.name} />
          {product.shortName || product.name}
        </div>
      </Reveal>
      <div className="relative">
        <div className="absolute left-[8%] right-[8%] top-0 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent lg:block" aria-hidden="true" />
        <div className="absolute left-1/2 -top-6 hidden h-6 w-px bg-border lg:block" aria-hidden="true" />
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((it, i) => {
            const inner = (
              <div className={`${CARD} relative h-full p-6`}>
                <span className="absolute -top-5 left-1/2 hidden h-5 w-px bg-border lg:block" aria-hidden="true" />
                <h3 className="mb-1.5 flex items-center gap-2 font-bold leading-snug text-foreground">
                  {it.name}
                  {it.href && <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden="true" />}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{it.description}</p>
              </div>
            );
            return (
              <li key={it.name} className="lg:pt-5">
                <Reveal delay={(i % 3) * 0.06} className="h-full">
                  {it.href ? (
                    <Link href={it.href} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

export function FaqSection({ product, text, tones }: { product: StoredProduct; text: Text; tones: Tones }) {
  const { faq } = pageContent(product);
  if (!faq.length) return null;
  return <FAQAccordion title={text["products.detail.faq"]} faqs={faq.map((f) => ({ question: f.q, answer: f.a }))} tone={tones.faq} />;
}

export function RelatedSection({ product, all, text, tones }: { product: StoredProduct; all: StoredProduct[]; text: Text; tones: Tones }) {
  const related = relatedProducts(product, all, 3);
  const nav = neighbours(product, all);
  if (!related.length && !nav) return null;
  return (
    <Section id="related" tone={tones.related}>
      <DetailHeading title={text["products.detail.related"]} />
      {related.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {related.map((p, i) => (
            <Reveal key={p.slug} delay={i * 0.08} className="h-full">
              <div className="group h-full rounded-2xl border border-border/50 bg-muted/20 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 motion-reduce:hover:translate-y-0">
                <Link href={productHref(p.slug)} className="flex h-full flex-col rounded-2xl p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <ProductLogo productKey={p.slug} size={44} title={p.name} />
                  </span>
                  <h3 className="mb-2 font-bold leading-snug text-foreground">{p.name}</h3>
                  <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground">{valueLine(p)}</p>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-all group-hover:gap-3 group-hover:text-primary">
                    {text["products.card.explore"]} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      )}
      {nav && (
        <nav aria-label="Product navigation" className="mt-10 flex flex-col items-stretch justify-between gap-4 border-t border-border/50 pt-8 sm:flex-row sm:items-center">
          <Link href={productHref(nav.prev.slug)} rel="prev" className="group inline-flex items-center gap-3 rounded-xl p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <ArrowLeft className="h-4 w-4 text-primary transition-transform group-hover:-translate-x-1" aria-hidden="true" />
            <span>
              <span className="block text-xs text-muted-foreground">{text["products.detail.prev"]}</span>
              <span className="font-semibold text-foreground group-hover:text-primary">{nav.prev.shortName || nav.prev.name}</span>
            </span>
          </Link>
          <Link href="/products" className="inline-flex items-center justify-center gap-2 rounded-full border border-border/50 bg-muted/30 px-5 py-2.5 text-sm font-bold text-foreground transition-all hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {text["products.detail.allProducts"]}
          </Link>
          <Link href={productHref(nav.next.slug)} rel="next" className="group inline-flex items-center justify-end gap-3 rounded-xl p-2 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span>
              <span className="block text-xs text-muted-foreground">{text["products.detail.next"]}</span>
              <span className="font-semibold text-foreground group-hover:text-primary">{nav.next.shortName || nav.next.name}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </nav>
      )}
    </Section>
  );
}
