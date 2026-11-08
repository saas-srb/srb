"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

/**
 * Alternate renderers for the `listing-hero` section type (theme variants
 * "centered", "split" and "banner") — same props as `ListingHero`.
 */
interface Props {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  image: string;
}

const rise = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.55 } } };

/** Centered title on a soft gradient. */
export function ListingHeroCentered({ eyebrow, title, description, icon: Icon }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background pb-16 pt-28 sm:pb-24 sm:pt-36">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-0 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-accent/15 blur-[120px]" />
      <motion.div initial="hidden" animate="visible" variants={rise} className="relative mx-auto max-w-3xl px-6 text-center lg:px-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Icon className="size-3.5" /> {eyebrow}
        </span>
        <h1 className="mt-6 text-4xl font-black tracking-tight text-foreground sm:text-6xl">{title}</h1>
        {description && <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">{description}</p>}
      </motion.div>
    </section>
  );
}

/** Title left, rounded photo right. */
export function ListingHeroSplit({ eyebrow, title, description, icon: Icon, image }: Props) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 bg-background pb-16 pt-28 sm:pb-20 sm:pt-32">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2 lg:px-8">
        <motion.div initial="hidden" animate="visible" variants={rise}>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            <Icon className="size-4" /> {eyebrow}
          </span>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-foreground sm:text-6xl">{title}</h1>
          {description && <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{description}</p>}
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} className="relative">
          <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-primary/25 to-brand-accent/20 blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-border/50 bg-muted/30" data-plain>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- CMS image (any host)
              <img src={image} alt="" className="aspect-[5/4] w-full object-cover" />
            ) : (
              <div className="flex aspect-[5/4] items-center justify-center text-primary/40"><Icon className="size-24" /></div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Full-width photo with the title over it. */
export function ListingHeroBanner({ eyebrow, title, description, icon: Icon, image }: Props) {
  return (
    <section className="relative isolate overflow-hidden bg-slate-950 pb-20 pt-32 text-white sm:pb-28 sm:pt-40">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- CMS image (any host)
        <img src={image} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-55" />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/20" />
      <motion.div initial="hidden" animate="visible" variants={rise} className="mx-auto max-w-7xl px-6 lg:px-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
          <Icon className="size-3.5 text-primary" /> {eyebrow}
        </span>
        <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">{title}</h1>
        {description && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/80">{description}</p>}
      </motion.div>
    </section>
  );
}
