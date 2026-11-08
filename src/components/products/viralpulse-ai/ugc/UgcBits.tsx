import type { ReactNode } from "react";
import { Briefcase, Clapperboard, Cpu, Dumbbell, Eye, GraduationCap, Headphones, MessagesSquare, Mic, Package, PartyPopper, Podcast, Scale, Shirt, Sofa, Sparkles, Star, Store, Sun, UserRound, Users, Utensils, Wrench, Zap, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusMeta, type Tone } from "@/lib/products/viralpulse-ai/ugc/ui-helpers";
import type { ProjectStatus } from "@/lib/products/viralpulse-ai/ugc/types";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  bad: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function Chip({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", TONE_CLASS[tone], className)}>
      {children}
    </span>
  );
}

export function UgcStatusChip({ status, pendingApproval = false }: { status: ProjectStatus; pendingApproval?: boolean }) {
  const m = statusMeta(status, pendingApproval);
  return (
    <Chip tone={m.tone}>
      {m.busy && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {m.label}
    </Chip>
  );
}

const ICONS: Record<string, typeof Film> = {
  conversation: MessagesSquare, review: Star, unboxing: Package, tutorial: GraduationCap, "problem-solution": Wrench, "day-in-life": Sun, grwm: Sparkles,
  "street-interview": Mic, reaction: Zap, pov: Eye, comparison: Scale, "founder-story": UserRound, podcast: Podcast, asmr: Headphones, food: Utensils,
  fitness: Dumbbell, "tech-demo": Cpu, "home-decor": Sofa, fashion: Shirt, family: Users, b2b: Briefcase, "local-business": Store, festival: PartyPopper,
};

/** A category tile: a gradient and the category's icon. No photos or fake previews: the gallery shows what each style is, not a sample video. */
export function CategoryTile({ category, className }: { category: string; className?: string }) {
  const Icon = ICONS[category] ?? Clapperboard;
  return (
    <div aria-hidden className={cn("flex items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/20 text-primary", className)}>
      <Icon className="size-1/3 max-h-8 min-h-4" />
    </div>
  );
}

export function ProgressBar({ pct, tone = "info", label }: { pct: number; tone?: Tone; label: string }) {
  const bar = tone === "bad" ? "bg-rose-500" : tone === "ok" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-primary";
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** A 9:16 (or 16:9) frame that reserves its space, so nothing jumps when the video arrives. */
export function PhoneFrame({ aspect = "9:16", children, className }: { aspect?: string; children: ReactNode; className?: string }) {
  const wide = aspect === "16:9";
  return (
    <div className={cn("mx-auto w-full overflow-hidden rounded-[1.75rem] border-[6px] border-foreground/80 bg-black shadow-xl", wide ? "max-w-xl" : "max-w-[15rem]", className)}>
      <div className={cn("relative w-full", wide ? "aspect-video" : "aspect-[9/16]")}>{children}</div>
    </div>
  );
}
