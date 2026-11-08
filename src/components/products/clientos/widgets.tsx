import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Check, Circle, Clock, X, type LucideIcon } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { brandify } from "@/lib/brand";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
export function PortalPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return <PanelPageHeader title={brandify(title)} description={subtitle ? brandify(subtitle) : undefined} actions={action} />;
}

// ---------------------------------------------------------------------------
export function ProgressRing({ value, size = 132, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={10} opacity={0.5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#portalRing)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
        />
        <defs>
          <linearGradient id="portalRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--color-brand-accent)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-black tabular-nums text-foreground">{pct}%</span>
        {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export interface TimelineStep {
  label: string;
  state: "done" | "current" | "upcoming" | "skipped";
  hint?: string;
}

export function HiringTimeline({ steps, rejected }: { steps: TimelineStep[]; rejected?: boolean }) {
  return (
    <ol className="relative ml-3 space-y-6 border-l-2 border-border/60 pl-6">
      {steps.map((s, i) => {
        const Icon = s.state === "done" ? Check : s.state === "current" ? Clock : s.state === "skipped" ? X : Circle;
        return (
          <li key={i} className="relative">
            <span
              className={cn(
                "absolute -left-[35px] flex size-6 items-center justify-center rounded-full ring-4 ring-background",
                s.state === "done" && "bg-green-500 text-white",
                s.state === "current" && "bg-gradient-to-br from-primary to-brand-accent text-white",
                s.state === "upcoming" && "bg-muted text-muted-foreground",
                s.state === "skipped" && "bg-destructive/20 text-destructive"
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <p className={cn("text-sm font-semibold", s.state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>
              {s.label}
            </p>
            {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
            {s.state === "current" && !rejected && (
              <p className="mt-0.5 text-xs font-medium text-primary">You are here</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
export function InfoCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
export function DocRow({
  name,
  meta,
  href,
}: {
  name: string;
  meta: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2 text-sm transition-colors hover:border-primary/40"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{name}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-primary">Download</span>
    </a>
  );
}

// ---------------------------------------------------------------------------
export function LinkPill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
/** Metric tile — same icon-chip + label/value pattern as the dashboards' HeroStat, on a standard GlassCard. */
export function PortalStat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <GlassCard interactive={false}>
      <CardContent className="flex h-full items-center gap-3 py-4">
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-black tabular-nums tracking-tight text-foreground">{value}</p>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </GlassCard>
  );
}
