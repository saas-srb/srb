import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { FAQS, FAQS_MORE } from "@/lib/platform/saas/content";
import { SectionHead } from "@/components/platform/saas/blocks";
import JsonLd from "@/components/platform/saas/JsonLd";
import { faqPage } from "@/lib/platform/saas/jsonld";
import Reveal from "@/components/platform/saas/Reveal";

/** The questions of the given topics (all when none are given), drawn from the site's real FAQ list. */
export function pickFaqs(topics?: string[], limit = 6) {
  const all = [...FAQS, ...FAQS_MORE];
  const chosen = topics && topics.length ? all.filter((f) => topics.includes(f.topic ?? "General")) : all;
  return chosen.slice(0, limit);
}

/**
 * The FAQ section every page ends with: icon, heading, description, then a single accordion. Same look on every page.
 * Pass `topics` to choose which of the site's FAQs belong on this page.
 */
export default function FaqSection({ topics, limit = 6, lead = "Still deciding? These are the things people ask before they start.", title = "Questions,", accent = "answered.", tone, extra = [], all = false, n }: { n?: string; topics?: string[]; limit?: number; lead?: string; title?: string; accent?: string; tone?: "muted"; extra?: { q: string; a: string }[]; all?: boolean }) {
  const items = [...extra, ...pickFaqs(topics, limit).filter((f) => !extra.some((e) => e.q === f.q))];
  if (items.length === 0) return null;
  return (
    <section id="faq" style={{ scrollMarginTop: 140 }} className={`sr-section ${tone === "muted" ? "bg-muted/10" : ""}`}>
      <JsonLd data={faqPage(items)} />
      <div className="sr-container">
        <SectionHead center icon="chat" n={n} eyebrow="FAQs" title={title} accent={accent} lead={lead} />
        <Reveal>
          <div className="mx-auto max-w-3xl divide-y divide-border/50 overflow-hidden rounded-3xl border border-border/60 bg-background shadow-sm">
            {items.map((f, i) => (
              <details key={f.q} className="sr-faq group px-6">
                <summary className="flex items-center justify-between gap-4 py-5 font-semibold">
                  <span className="flex items-center gap-4"><span className="sr-outline w-8 flex-none text-xl font-black leading-none" aria-hidden>{String(i + 1).padStart(2, "0")}</span>{f.q}</span>
                  <span className="sr-faq-plus flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/10 text-primary"><Plus className="h-4 w-4" /></span>
                </summary>
                <p className="pb-5 pl-12 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
            <div className="px-6 py-5">{all ? <Link href="/contact" className="sr-link">Still unsure? Ask us <ArrowRight className="h-4 w-4" /></Link> : <Link href="/faqs" className="sr-link">All FAQs <ArrowRight className="h-4 w-4" /></Link>}</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
