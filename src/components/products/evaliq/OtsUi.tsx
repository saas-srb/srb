import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { ReactNode } from "react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { cn } from "@/lib/utils";
import { ASSIGNMENT_STATUSES, TEST_STATUSES, TONE_CLASS, toneFor, labelOf, type EffectiveTestStatus, type AssignmentStatus } from "@/lib/products/evaliq/constants";

/** Shared, server-renderable pieces of the OTS UI — the same visual language as SOP / SMMS / DLMS. */

export function PageHeader({ title, description, crumbs, actions, root = { label: "Online Tests", href: "/evaliq" } }: { title: ReactNode; description?: ReactNode; crumbs: { label: string; href?: string }[]; actions?: ReactNode; root?: { label: string; href: string } | null }) {
  return <PanelPageHeader breadcrumbs={[...(root ? [root] : []), ...crumbs]} title={title} description={description} actions={actions} />;
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

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</div>}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warn" | "ok" }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold tabular-nums text-foreground", tone === "danger" && "text-rose-600 dark:text-rose-400", tone === "warn" && "text-amber-600 dark:text-amber-400", tone === "ok" && "text-emerald-600 dark:text-emerald-400")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode; className?: string }) {
  const cls = {
    info: "border-primary/20 bg-primary/5 text-foreground",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    error: "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200",
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  }[tone];
  return <div className={cn("rounded-2xl border px-4 py-3 text-sm", cls, className)}>{children}</div>;
}

export function TestStatusBadge({ status }: { status: EffectiveTestStatus }) {
  return <Badge className={toneFor(TEST_STATUSES, status)}>{labelOf(TEST_STATUSES, status)}</Badge>;
}

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return <Badge className={toneFor(ASSIGNMENT_STATUSES, status)}>{labelOf(ASSIGNMENT_STATUSES, status)}</Badge>;
}

export function PassBadge({ passed, provisional }: { passed: boolean | null | undefined; provisional?: boolean }) {
  if (passed === null || passed === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  if (provisional) return <Badge className={TONE_CLASS.amber}>Provisional</Badge>;
  return <Badge className={passed ? TONE_CLASS.green : TONE_CLASS.rose}>{passed ? "Pass" : "Fail"}</Badge>;
}

export function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: keyof typeof TONE_CLASS }) {
  return <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", TONE_CLASS[tone])}>{children}</span>;
}

export function Pager({ page, totalPages, total, noun, href }: { page: number; totalPages: number; total: number; noun: string; href: (p: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{`Page ${page} of ${totalPages} · ${total} ${noun}`}</span>
      <div className="flex gap-2">
        <a href={href(Math.max(page - 1, 1))} aria-disabled={page <= 1} className={cn("rounded-lg border border-border/60 px-3 py-1 text-xs hover:bg-muted", page <= 1 && "pointer-events-none opacity-50")}>
          Previous
        </a>
        <a href={href(Math.min(page + 1, totalPages))} aria-disabled={page >= totalPages} className={cn("rounded-lg border border-border/60 px-3 py-1 text-xs hover:bg-muted", page >= totalPages && "pointer-events-none opacity-50")}>
          Next
        </a>
      </div>
    </div>
  );
}

/** Builds `?a=b` hrefs that keep the current filters. */
export function qsHref(base: string, sp: Record<string, string | undefined>, patch: Record<string, string | null>): string {
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
