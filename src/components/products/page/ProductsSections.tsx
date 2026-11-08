import Link from "next/link";
import { ArrowRight, ArrowRightLeft, Bot, Fingerprint, Network, ShieldCheck, Sparkles } from "lucide-react";
import SectionHeader from "@/components/sections/SectionHeader";
import Reveal from "@/components/products/page/Reveal";
import ProductDemoForm from "@/components/products/page/ProductDemoForm";
import { BTN_PRIMARY } from "@/components/products/page/cta-styles";
import { resolveIcon } from "@/lib/products/sitecraft-ai/icon-map";
import { groupByCategory, hasOwnAi, label, productHref, SIGNUP_PATH, type StoredProduct } from "@/lib/products/shared";
import ProductLogo from "@/components/products/ProductLogo";

type Text = Record<string, string>;

/** "One connected platform": the product map by category plus the real hand-offs between products. */
export function ProductsConnected({ products, text }: { products: StoredProduct[]; text: Text }) {
  const flows = [1, 2, 3, 4].map((n) => ({ title: text[`products.listing.connected.flow${n}.title`], body: text[`products.listing.connected.flow${n}.text`] })).filter((f) => f.title);
  return (
    <section id="platform" className="relative scroll-mt-24 overflow-hidden bg-muted/10 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader category={text["products.listing.connected.badge"]} heading={text["products.listing.connected.title"]} description={text["products.listing.connected.description"]} />
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <div className="relative h-full overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 p-6 shadow-xl backdrop-blur-xl sm:p-8">
              <div className="mx-auto mb-6 flex w-fit items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-bold text-foreground">
                <Network className="h-5 w-5 text-primary" aria-hidden="true" />
                <span>{text["products.listing.connected.hub"]}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {groupByCategory(products).map((g) => (
                  <div key={g.category} className="rounded-2xl border border-border/50 bg-background/70 p-4">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-primary">{g.category}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {g.products.map((p) => {
                        return (
                          <li key={p.slug}>
                            <Link href={productHref(p.slug)} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                              <ProductLogo productKey={p.slug} size={16} />
                              {label(p)}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <ul className="grid grid-cols-1 gap-4 lg:col-span-5">
            {flows.map((f, i) => (
              <li key={f.title}>
                <Reveal delay={i * 0.08} className="h-full">
                  <div className="flex h-full gap-4 rounded-2xl border border-border/50 bg-muted/20 p-5">
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary/10"><ArrowRightLeft className="h-5 w-5 text-primary" aria-hidden="true" /></span>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{f.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** "AI across the suite": built from the products' own AI features, so the list is exactly what exists. */
export function ProductsAiSuite({ products, text }: { products: StoredProduct[]; text: Text }) {
  // Only products with AI of their own: a product that says "No AI of its own" is not part of this list.
  const withAi = products.filter(hasOwnAi);
  if (!withAi.length) return null;
  return (
    <section className="relative bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <SectionHeader category={text["products.listing.ai.badge"]} heading={text["products.listing.ai.title"]} description={text["products.listing.ai.description"]} />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {withAi.map((p, i) => {
            const feature = p.aiFeatures!.find((f) => !/^no ai of its own/i.test(f.title.trim()))!;
            const Icon = resolveIcon(feature.icon || p.iconName);
            return (
              <Reveal key={p.slug} delay={(i % 3) * 0.08}>
                <Link href={`${productHref(p.slug)}#ai`} className="group flex h-full flex-col rounded-2xl border border-border/50 bg-muted/20 p-6 transition-all hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" aria-hidden="true" /></span>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label(p)}</p>
                  <h3 className="mt-1 text-base font-bold text-foreground group-hover:text-primary">{feature.title}</h3>
                  <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-primary">
                    {text["products.card.explore"]} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** Closing CTA band: copy + Get Started on the left, the Request Demo form (anchor `#demo`) on the right. */
export function ProductsCtaBand({ products, text, title, description, defaultProduct = "", source }: { products: StoredProduct[]; text: Text; title: string; description: string; defaultProduct?: string; source: string }) {
  return (
    <section id="demo" className="relative scroll-mt-28 overflow-hidden bg-muted/10 py-24 sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <Reveal>
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary"><Sparkles className="h-4 w-4" aria-hidden="true" />{text["products.demo.title"]}</p>
          <h2 id="demo-heading" className="mb-5 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl">{title}</h2>
          <p className="mb-8 max-w-xl text-lg leading-relaxed text-muted-foreground">{description}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={SIGNUP_PATH} className={BTN_PRIMARY} data-signup-cta="final">
              {text["products.cta.createAutomation"]}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-8 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />{text["products.cta.bullet1"]}</li>
            <li className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-primary" aria-hidden="true" />{text["products.cta.bullet2"]}</li>
            <li className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" aria-hidden="true" />{text["products.cta.bullet3"]}</li>
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <ProductDemoForm products={products.map((p) => ({ slug: p.slug, name: p.name }))} defaultProduct={defaultProduct} source={source} text={text} />
        </Reveal>
      </div>
    </section>
  );
}
