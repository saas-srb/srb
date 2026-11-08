import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { cn } from "@/lib/utils";
import { SEVERITY_META, ISSUE_STATUS_LABEL, CATEGORY_LABEL, type Severity, type IssueStatus, type Category } from "@/lib/products/rankmax-ai/checks";
import { TRUST_META, type Trust } from "@/lib/products/rankmax-ai/integrations/providers";

/** Shared, server-renderable pieces of the SEO product UI (badges, headers, cards) — the same visual language as SOP/FMS. */

export function PageHeader({ title, description, crumbs, actions }: { title: ReactNode; description?: ReactNode; crumbs: { label: string; href?: string }[]; actions?: ReactNode }) {
  return <PanelPageHeader breadcrumbs={[{ label: "SEO", href: "/rankmax-ai" }, ...crumbs]} title={title} description={description} actions={actions} />;
}

export function SectionCard({ title, description, children, className, action }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <GlassCard interactive={false} className={className}>
      <CardHeader className="pb-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-bold">{title}</CardTitle>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </GlassCard>
  );
}

export function SeverityBadge({ severity }: { severity: Severity | "passed" }) {
  const m = SEVERITY_META[severity];
  return <Badge className={m.className}>{m.label}</Badge>;
}

const STATUS_CLASS: Record<IssueStatus, string> = {
  open: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  in_progress: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  ignored: "bg-muted text-muted-foreground",
};

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return <Badge className={STATUS_CLASS[status]}>{ISSUE_STATUS_LABEL[status]}</Badge>;
}

export function CategoryBadge({ category }: { category: Category }) {
  return <Badge variant="outline">{CATEGORY_LABEL[category]}</Badge>;
}

export function TrustBadge({ trust, label }: { trust: Trust; label?: string }) {
  const m = TRUST_META[trust];
  return <Badge className={cn("h-5 px-1.5 text-[10px]", m.className)}>{label ?? m.label}</Badge>;
}

export function scoreTone(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = score >= 80 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : score >= 50 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400";
  return <Badge className={cn("tabular-nums", cls)}>{score}</Badge>;
}

/** Circular 0–100 score gauge. */
export function ScoreRing({ score, label, size = 104 }: { score: number | null; label: string; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  const stroke = score === null ? "var(--muted)" : v >= 80 ? "#10b981" : v >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${label}: ${score ?? "no data"}`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="9" opacity={0.6} />
        <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
        <text x="50" y="55" textAnchor="middle" fontSize="24" fontWeight="800" fill="currentColor" className="text-foreground">
          {score ?? "—"}
        </text>
      </svg>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

/** Position movement: positive = improved (moved up). */
export function PositionChange({ from, to }: { from: number | null; to: number | null }) {
  if (from === null && to === null) return <span className="text-xs text-muted-foreground">—</span>;
  if (from === null) return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">New</Badge>;
  if (to === null) return <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400">Lost</Badge>;
  const d = from - to;
  if (d === 0) return <span className="inline-flex items-center text-xs text-muted-foreground"><Minus className="size-3" /></span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums", d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
      {d > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(Math.round(d * 10) / 10)}
    </span>
  );
}

export function Position({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">Not ranking</span>;
  const cls = value <= 3 ? "text-emerald-600 dark:text-emerald-400" : value <= 10 ? "text-sky-700 dark:text-sky-400" : "text-foreground";
  return <span className={cn("font-semibold tabular-nums", cls)}>{Math.round(value * 10) / 10}</span>;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const cls = {
    info: "border-primary/20 bg-primary/5 text-foreground",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    error: "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  }[tone];
  return <div className={cn("rounded-2xl border px-4 py-3 text-sm", cls)}>{children}</div>;
}

export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "—" : new Intl.NumberFormat("en-IN").format(Math.round(n * 10) / 10));
export const fmtPct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? "—" : `${(Math.round(n * 10 ** (digits + 2)) / 10 ** digits).toFixed(digits)}%`);
