"use client";

import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import SectionHeader from "@/components/sections/SectionHeader";
import type { HomeSectionHeaderProps } from "@/components/sections/home/types";

/**
 * Alternate renderers for `home-why-choose-us` ("list", "split") and
 * `home-how-we-work` ("timeline", "numbered") — same props as the standard
 * card grids.
 */
type Reason = { name: string; desc: string; icon: LucideIcon };
type Step = { title: string; description: string; icon: LucideIcon };
type StepsProps = HomeSectionHeaderProps & { steps: Step[]; linkLabel?: string; linkHref?: string };

const two = (n: number) => String(n).padStart(2, "0");

function Header(h: HomeSectionHeaderProps, align: "left" | "center") {
  return <SectionHeader align={align} category={h.eyebrow} icon={h.headerIcon} heading={h.heading} accent={h.accent} description={h.description} className={align === "center" ? "mx-auto" : ""} />;
}

/** Large numbered rows separated by dividers. */
export function WhyChooseUsList({ reasons, ...header }: HomeSectionHeaderProps & { reasons: Reason[] }) {
  return (
    <section className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        {Header(header, "left")}
        <ol className="divide-y divide-border/60 border-y border-border/60">
          {reasons.map((r, i) => (
            <li key={r.name} className="grid gap-4 py-8 sm:grid-cols-[5rem_1fr_2fr] sm:items-baseline">
              <span className="text-4xl font-black text-primary/30">{two(i + 1)}</span>
              <h3 className="flex items-center gap-3 text-xl font-bold text-foreground"><r.icon className="size-5 text-primary" /> {r.name}</h3>
              <p className="text-base leading-relaxed text-muted-foreground">{r.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Heading pinned on the left, reasons stacked on the right. */
export function WhyChooseUsSplit({ reasons, ...header }: HomeSectionHeaderProps & { reasons: Reason[] }) {
  return (
    <section className="bg-muted/20 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-5 lg:gap-16 lg:px-8">
        <div className="lg:col-span-2"><div className="lg:sticky lg:top-32">{Header(header, "left")}</div></div>
        <div className="space-y-4 lg:col-span-3">
          {reasons.map((r) => (
            <div key={r.name} className="flex gap-5 rounded-2xl border border-border/60 bg-background p-6 transition-shadow hover:shadow-lg hover:shadow-primary/10">
              <span className="flex size-12 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary"><r.icon className="size-6" /></span>
              <div>
                <h3 className="text-lg font-bold text-foreground">{r.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepsLink({ label, href }: { label?: string; href?: string }) {
  if (!label || !href) return null;
  return (
    <div className="mt-12">
      <Link href={href} className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-transform hover:scale-105">
        {label} <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

/** A vertical timeline with a connecting line. */
export function StepsTimeline({ steps, linkLabel, linkHref, ...header }: StepsProps) {
  return (
    <section className="border-b border-border/50 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        {Header(header, "center")}
        <ol className="relative ml-5 border-l-2 border-primary/25">
          {steps.map((s, i) => (
            <li key={s.title} className="relative pb-12 pl-10 last:pb-0">
              <span className="absolute -left-[1.4rem] top-0 flex size-10 items-center justify-center rounded-full border-4 border-background bg-primary text-sm font-black text-primary-foreground">{i + 1}</span>
              <h3 className="flex items-center gap-2 text-xl font-bold text-foreground"><s.icon className="size-5 text-primary" /> {s.title}</h3>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">{s.description}</p>
            </li>
          ))}
        </ol>
        <div className="flex justify-center"><StepsLink label={linkLabel} href={linkHref} /></div>
      </div>
    </section>
  );
}

/** Oversized step numbers across a horizontal strip. */
export function StepsNumbered({ steps, linkLabel, linkHref, ...header }: StepsProps) {
  return (
    <section className="border-b border-border/50 bg-muted/20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {Header(header, "left")}
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="border-t-2 border-primary/40 pt-5">
              <span className="text-6xl font-black leading-none text-primary/20">{two(i + 1)}</span>
              <h3 className="mt-4 text-lg font-bold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
        <StepsLink label={linkLabel} href={linkHref} />
      </div>
    </section>
  );
}
