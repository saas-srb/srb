"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Alternate renderers for `faq-accordion` ("cards", "split") and `detail-cta`
 * ("banner", "split") — same props as the standard sections.
 */
interface FaqProps {
  title?: string;
  faqs: { question: ReactNode; answer: ReactNode }[];
  icon?: LucideIcon;
  category?: string;
}

function Heading({ title, category, icon: Icon, align }: Pick<FaqProps, "title" | "category" | "icon"> & { align: "left" | "center" }) {
  return (
    <div className={align === "center" ? "mx-auto mb-12 max-w-2xl text-center" : ""}>
      {(category || Icon) && (
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
          {Icon && <Icon className="size-4" />} {category}
        </p>
      )}
      {title && <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{title}</h2>}
    </div>
  );
}

/** Questions as a two-column grid of open cards. */
export function FaqCards({ title, faqs, icon, category }: FaqProps) {
  return (
    <section className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Heading title={title} category={category} icon={icon} align="center" />
        <div className="grid gap-5 md:grid-cols-2">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-3xl border border-border/60 bg-muted/20 p-7">
              <h3 className="text-lg font-bold text-foreground">{f.question}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Heading pinned left, collapsible questions right. */
export function FaqSplit({ title, faqs, icon, category }: FaqProps) {
  return (
    <section className="bg-muted/20 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-5 lg:gap-16 lg:px-8">
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-32"><Heading title={title} category={category} icon={icon} align="left" /></div>
        </div>
        <div className="divide-y divide-border/60 border-y border-border/60 lg:col-span-3">
          {faqs.map((f, i) => (
            <details key={i} className="group py-5" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-foreground">
                {f.question}
                <ChevronDown className="size-5 flex-none text-primary transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 pr-8 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

interface CtaProps {
  heading: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  external?: boolean;
  checklist?: string[];
}

function CtaButton({ ctaLabel, ctaHref, external, className }: Pick<CtaProps, "ctaLabel" | "ctaHref" | "external"> & { className: string }) {
  const href = ctaHref || "/contact";
  const body = <>{ctaLabel || "Contact us"} <ArrowRight className="size-4" /></>;
  return external ? <a href={href} className={className}>{body}</a> : <Link href={href} className={className}>{body}</Link>;
}

/** A bold full-width colour band. */
export function DetailCtaBanner(p: CtaProps) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-brand-deep py-20 text-primary-foreground sm:py-28">
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/15 blur-3xl" />
      <div className="relative mx-auto max-w-4xl px-6 text-center lg:px-8">
        <h2 className="text-3xl font-black tracking-tight sm:text-5xl">{p.heading}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg opacity-90">{p.description}</p>
        {p.checklist && p.checklist.length > 0 && (
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium">
            {p.checklist.map((c) => <li key={c} className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4" /> {c}</li>)}
          </ul>
        )}
        <CtaButton {...p} className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-slate-900 shadow-xl transition-transform hover:scale-105" />
      </div>
    </section>
  );
}

/** Heading and button on one side, checklist on the other. */
export function DetailCtaSplit(p: CtaProps) {
  return (
    <section className="bg-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-10 rounded-[2rem] border border-border/60 bg-muted/30 p-8 sm:p-12 lg:grid-cols-2" data-plain>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">{p.heading}</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">{p.description}</p>
            <CtaButton {...p} className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground transition-transform hover:scale-105" />
          </div>
          {p.checklist && p.checklist.length > 0 && (
            <ul className="space-y-3">
              {p.checklist.map((c) => (
                <li key={c} className="flex items-center gap-3 rounded-2xl bg-background/80 px-5 py-4 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="size-5 flex-none text-primary" /> {c}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
