import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import { LEGAL_LINKS, type LegalDoc } from "@/lib/platform/saas/site";
import { HeroCtas, PageHero } from "@/components/platform/saas/blocks";
import LegalToc from "@/components/platform/saas/LegalToc";
import ScrollToTop from "@/components/platform/saas/product/ScrollToTop";
import JsonLd from "@/components/platform/saas/JsonLd";
import { breadcrumbList, webPage } from "@/lib/platform/saas/jsonld";
import Reveal from "@/components/platform/saas/Reveal";

const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A policy page: an at-a-glance row, the numbered sections with a table of contents that follows the reader, the other
 * policies one click away, and a way to ask a question.
 */
export default function LegalPage({ doc, after }: { doc: { title: string; intro: React.ReactNode; sections: LegalDoc["sections"]; highlights?: LegalDoc["highlights"] }; /** Something to show under the sections, such as a form. */ after?: React.ReactNode }) {
  const toc = doc.sections.map((s) => ({ id: slug(s.heading), label: s.heading }));
  const href = LEGAL_LINKS.find((l) => l.label === doc.title)?.href ?? "/";
  return (
    <>
      <JsonLd data={[webPage({ path: href, name: doc.title, description: typeof doc.intro === "string" ? doc.intro : doc.title }), breadcrumbList([{ name: "Home", path: "/" }, { name: doc.title, path: href }])]} />
      <PageHero art="legal" photo="office" shot="dlms" shotName="Digi Locker" eyebrow="Legal" title={doc.title} lead={doc.intro} size="compact">
        <HeroCtas primary={{ label: "Get started free", href: "/signup" }} secondary={{ label: "Contact us", href: "/contact" }} />
      </PageHero>

      <ScrollToTop pageKey={doc.title} />
      <section className="sr-section">
        <div data-hop-target data-hop-offset="140" className="sr-container grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)_200px] lg:gap-10">

          {/* Left: Other policies */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">All policies</p>
            <ul className="sr-scroll-x flex gap-2 lg:block lg:space-y-0.5">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href} className="shrink-0"><Link data-product-link href={l.href} aria-current={doc.title === l.label ? "page" : undefined} className={`block rounded-xl px-3 py-2 text-sm transition-colors ${doc.title === l.label ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}>{l.label}</Link></li>
              ))}
            </ul>
          </aside>

          {/* Center: content */}
          <div className="min-w-0 max-w-3xl">
            <details className="group mb-8 rounded-2xl border border-border/60 bg-card shadow-sm lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-black">On this page<span className="text-xs font-bold text-primary group-open:hidden">Tap to open</span></summary>
              <div className="border-t border-border/60 p-3"><LegalToc items={toc} /></div>
            </details>
            {doc.sections.map((s, i) => (
              <Reveal key={s.heading}>
                <section id={slug(s.heading)} className="scroll-mt-32 border-t border-border/70 py-10 first:border-t-0 first:pt-0">
                  <div className="mb-4 flex items-start gap-5">
                    <span className="sr-outline w-14 flex-none text-5xl font-black leading-none" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                    <h2 className="pt-1 text-2xl font-black leading-tight tracking-tight sm:text-3xl">{s.heading}</h2>
                  </div>
                  <div className="space-y-4 pl-0 text-[17px] leading-[1.8] text-muted-foreground sm:pl-[76px]">
                    {s.body?.map((p) => <p key={p}>{p}</p>)}
                    {s.list && (
                      <ul className="space-y-3">
                        {s.list.map((l) => {
                          const k = l.indexOf(":");
                          const lead = k > 0 && k < 48 ? l.slice(0, k) : null;
                          return <li key={l} className="flex gap-3"><span className="sr-circle mt-2 h-2 w-2 flex-none" aria-hidden /><span>{lead ? <><strong className="text-foreground">{lead}:</strong>{l.slice(k + 1)}</> : l}</span></li>;
                        })}
                      </ul>
                    )}
                  </div>
                </section>
              </Reveal>
            ))}

            {after ? <div className="mt-6">{after}</div> : null}

            <div className="sr-band mt-8 flex flex-col items-start gap-5 rounded-[2rem] p-8 shadow-2xl shadow-primary/25 sm:flex-row sm:items-center sm:p-10">
              <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30"><MessageCircle className="h-6 w-6" /></span>
              <div className="flex-1">
                <p className="text-xl font-black tracking-tight">Questions about this {doc.title.toLowerCase().replace(/ policy$/, " policy")}?</p>
                <p className="mt-1 text-white/80">Write to us — we reply within one business day.</p>
              </div>
              <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-black shadow-xl transition-transform hover:scale-105">Contact us <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>

          {/* Right: On this page */}
          <aside className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">On this page</p>
            <LegalToc items={toc} />
          </aside>

        </div>
      </section>

    </>
  );
}
