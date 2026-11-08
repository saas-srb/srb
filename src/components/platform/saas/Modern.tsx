import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import Icon from "@/components/platform/saas/Icon";
import ProductLogo from "@/components/products/ProductLogo";
import Reveal from "@/components/platform/saas/Reveal";
import type { IconKey } from "@/lib/platform/saas/content";

/**
 * Open layouts (no boxes): a timeline with numbered nodes, hairline-separated numbered rows, icon columns and a two-row
 * marquee. They carry the same content the card layouts did, laid out the way modern product sites do.
 */

/** Steps joined by a flowing line: node, step label, title, text and optional points. Horizontal on desktop, vertical on phones. */
export function TimelineSteps({ items, cols = 4 }: { items: { title: string; text?: string; icon?: IconKey; points?: string[] }[]; cols?: 3 | 4 }) {
  return (
    <ol className={`relative grid gap-12 md:grid-cols-2 ${cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"} lg:gap-8`}>
      <span className="sr-pipe absolute left-[6%] right-[6%] top-[27px] hidden lg:block" aria-hidden />
      <span className="absolute bottom-0 left-[27px] top-2 w-px bg-gradient-to-b from-primary/50 to-transparent md:hidden" aria-hidden />
      {items.map((it, i) => (
        <Reveal key={it.title} as="li" delay={i * 90} className="relative pl-[72px] md:pl-0">
          <span className="sr-circle absolute left-0 top-0 h-[54px] w-[54px] text-lg font-black shadow-xl shadow-primary/30 ring-[6px] ring-background md:relative md:mb-6">
            {it.icon ? <Icon name={it.icon} className="h-6 w-6" /> : i + 1}
          </span>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Step 0{i + 1}</p>
          <h3 className="mt-1.5 text-2xl font-black leading-tight tracking-tight">{it.title}</h3>
          {it.text && <p className="mt-2 leading-relaxed text-muted-foreground">{it.text}</p>}
          {it.points && it.points.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm">
              {it.points.map((p) => <li key={p} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 flex-none text-primary" strokeWidth={3} />{p}</li>)}
            </ul>
          )}
        </Reveal>
      ))}
    </ol>
  );
}

/** Numbered rows separated by hairlines: outline numeral, icon + title, text, and an arrow that slides in on hover. */
export function NumberedRows({ items, cols = 2 }: { items: { title: string; text?: string; icon?: IconKey; href?: string; tag?: string }[]; cols?: 1 | 2 }) {
  return (
    <ul className={`grid gap-x-16 ${cols === 2 ? "lg:grid-cols-2" : ""}`}>
      {items.map((it, i) => {
        const body = (
          <>
            <span className="sr-outline w-16 flex-none text-5xl font-black leading-none sm:w-20 sm:text-6xl" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2.5">
                {it.icon && <span className="sr-icon h-9 w-9 rounded-xl"><Icon name={it.icon} className="h-4 w-4" /></span>}
                <span className="text-lg font-black leading-tight tracking-tight transition-colors group-hover:text-primary sm:text-xl">{it.title}</span>
                {it.tag && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">{it.tag}</span>}
              </span>
              {it.text && <span className="mt-2 block leading-relaxed text-muted-foreground">{it.text}</span>}
            </span>
            {it.href && <ArrowUpRight className="mt-1 h-5 w-5 flex-none -translate-x-2 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />}
          </>
        );
        const cls = "group flex items-start gap-5 border-t border-border/70 py-8 transition-all duration-300 hover:bg-gradient-to-r hover:from-primary/[0.06] hover:to-transparent sm:gap-7";
        return (
          <Reveal key={it.title} as="li" delay={(i % 2) * 80}>
            {it.href ? <Link href={it.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
          </Reveal>
        );
      })}
    </ul>
  );
}

/** Icon columns with no outline: a large glowing icon, a bold title and the text, in a row. */
export function IconColumns({ items, cols = 4 }: { items: { title: string; text?: string; icon: IconKey }[]; cols?: 3 | 4 }) {
  return (
    <div className={`grid gap-x-10 gap-y-12 sm:grid-cols-2 ${cols === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {items.map((it, i) => (
        <Reveal key={it.title} delay={(i % cols) * 80} className="group">
          <span className="relative mb-5 inline-flex">
            <span className="absolute inset-0 -z-10 scale-125 rounded-full bg-primary/25 blur-xl transition-opacity group-hover:opacity-100 sm:opacity-60" aria-hidden />
            <span className="sr-icon h-16 w-16 rounded-3xl"><Icon name={it.icon} className="h-7 w-7" /></span>
          </span>
          <h3 className="text-xl font-black leading-tight tracking-tight">{it.title}</h3>
          {it.text && <p className="mt-2 leading-relaxed text-muted-foreground">{it.text}</p>}
        </Reveal>
      ))}
    </div>
  );
}

/** Two endless rows of chips moving in opposite directions. */
export function ChipMarquee({ rows }: { rows: { label: string; icon?: IconKey; productKey?: string; struck?: boolean }[][] }) {
  return (
    <div className="space-y-4">
      {rows.map((row, r) => {
        const doubled = [...row, ...row];
        return (
          <div key={r} className="sr-marquee-wrap">
            <div className={`sr-marquee ${r % 2 ? "sr-marquee-rev" : ""}`} style={{ animationDuration: "60s" }}>
              {doubled.map((c, i) => (
                <span key={`${c.label}-${i}`} aria-hidden={i >= row.length} className={`inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border px-5 py-3 text-[15px] font-semibold ${c.struck ? "border-border/70 bg-muted/40 text-muted-foreground line-through decoration-muted-foreground/40" : "border-primary/25 bg-background text-foreground shadow-sm"}`}>
                  {c.productKey ? <ProductLogo productKey={c.productKey} size={24} title={c.label} /> : c.icon && <Icon name={c.icon} className={`h-4 w-4 ${c.struck ? "" : "text-primary"}`} />}
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
