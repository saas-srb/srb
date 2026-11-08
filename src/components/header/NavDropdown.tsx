"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { ComponentType } from "react";

/**
 * The header's dropdown styles besides the standard "mega" product (which lives in `Header.tsx`). The theme picks one
 * (component-variants.ts `MENU_VARIANTS`): "list" (compact popover), "tiles" (full-width bar of tiles) or
 * "minimal" (plain text links). Same navigation data in every style.
 */
export interface DropdownItem {
  name: string;
  href: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}
export interface DropdownNav {
  name: string;
  href: string;
  items: DropdownItem[];
}

const motionProps = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: { duration: 0.16, ease: "easeOut" as const },
};

export default function NavDropdown({ style, nav, hideViewAll = false }: { style: string; nav: DropdownNav; hideViewAll?: boolean }) {
  if (style === "tiles") {
    return (
      <motion.div {...motionProps} className="absolute inset-x-0 top-full z-50 px-4 pt-2">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border/60 bg-background/95 p-5 shadow-2xl backdrop-blur-xl" data-plain>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nav.items.map((it) => (
              <Link key={it.name + it.href} href={it.href} className="group flex flex-col gap-2 rounded-2xl border border-border/50 p-4 transition-colors hover:border-primary/40 hover:bg-primary/5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><it.icon className="size-5" /></span>
                <span className="text-sm font-bold text-foreground">{it.name}</span>
                {it.description && <span className="line-clamp-2 text-xs text-muted-foreground">{it.description}</span>}
              </Link>
            ))}
          </div>
          {!hideViewAll && <Link href={nav.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">View all {nav.name} <ArrowRight className="size-3.5" /></Link>}
        </div>
      </motion.div>
    );
  }
  if (style === "minimal") {
    return (
      <motion.div {...motionProps} className="absolute left-0 top-full z-50 mt-1 min-w-52">
        <ul className="border-l-2 border-primary/50 bg-background/95 py-2 pl-4 pr-6 shadow-lg backdrop-blur-xl" data-plain>
          {nav.items.map((it) => (
            <li key={it.name + it.href}>
              <Link href={it.href} className="block py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:text-primary">{it.name}</Link>
            </li>
          ))}
        </ul>
      </motion.div>
    );
  }
  // "list": a compact popover with icon rows.
  return (
    <motion.div {...motionProps} className="absolute left-0 top-full z-50 mt-2 w-80">
      <div className="rounded-2xl border border-border/60 bg-background/95 p-2 shadow-xl backdrop-blur-xl" data-plain>
        {nav.items.map((it) => (
          <Link key={it.name + it.href} href={it.href} className="group flex items-start gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted/60">
            <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><it.icon className="size-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{it.name}</span>
              {it.description && <span className="line-clamp-1 text-xs text-muted-foreground">{it.description}</span>}
            </span>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
