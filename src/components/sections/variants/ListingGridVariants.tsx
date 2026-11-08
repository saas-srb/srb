"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

/**
 * Alternate renderers for the `listing-grid` section type (theme variants
 * "list" and "compact") — same props as `ListingGrid`.
 */
interface Item {
  title: string;
  subtitle: string;
  description: string;
  href: string;
  icon: LucideIcon;
  image: string;
  highlights: string[];
}
interface Props {
  badge: string;
  badgeIcon: LucideIcon;
  sectionLabel: string;
  ctaLabel?: string;
  items: Item[];
}

function Label({ text }: { text: string }) {
  return text ? <p className="mb-10 text-sm font-semibold uppercase tracking-widest text-primary">{text}</p> : null;
}

/** One alternating image-and-text row per item. */
export function ListingGridRows({ sectionLabel, ctaLabel, items }: Props) {
  return (
    <section className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Label text={sectionLabel} />
        <div className="space-y-16 sm:space-y-24">
          {items.map((item, i) => (
            <div key={item.href + item.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 ? "lg:order-2" : ""}>
                <div className="overflow-hidden rounded-3xl border border-border/60 bg-muted/30">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- CMS image (any host)
                    <img src={item.image} alt="" className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-primary/40"><item.icon className="size-20" /></div>
                  )}
                </div>
              </div>
              <div>
                <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><item.icon className="size-6" /></span>
                <h3 className="mt-5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{item.title}</h3>
                {item.subtitle && <p className="mt-2 text-lg font-medium text-primary">{item.subtitle}</p>}
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">{item.description}</p>
                {item.highlights.length > 0 && (
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {item.highlights.map((h) => <li key={h} className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-foreground">{h}</li>)}
                  </ul>
                )}
                <Link href={item.href} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary hover:gap-3">
                  {ctaLabel || "Learn more"} <ArrowRight className="size-4 transition-all" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A tidy grid of compact icon cards — no photos. */
export function ListingGridCompact({ sectionLabel, ctaLabel, items }: Props) {
  return (
    <section className="bg-muted/20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Label text={sectionLabel} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.href + item.title} href={item.href} className="group flex flex-col rounded-2xl border border-border/60 bg-background p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><item.icon className="size-5" /></span>
              <h3 className="mt-5 text-lg font-bold text-foreground">{item.title}</h3>
              {item.subtitle && <p className="mt-1 text-sm font-medium text-primary">{item.subtitle}</p>}
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground group-hover:text-primary">
                {ctaLabel || "Learn more"} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
