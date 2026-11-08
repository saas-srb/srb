import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { cn } from "@/lib/utils";
import type { ExpiryState, RecordStatus, Scope } from "@/lib/products/cybervault/constants";

/** Shared, server-renderable pieces of the DLMS UI — the same visual language as SOP/SEO/FMS. */

export function PageHeader({ title, description, crumbs, actions }: { title: ReactNode; description?: ReactNode; crumbs: { label: string; href?: string }[]; actions?: ReactNode }) {
  return <PanelPageHeader breadcrumbs={[{ label: "CyberVault", href: "/cybervault" }, ...crumbs]} title={title} description={description} actions={actions} />;
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

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "danger" | "warn" }) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold tabular-nums text-foreground", tone === "danger" && "text-rose-600 dark:text-rose-400", tone === "warn" && "text-amber-600 dark:text-amber-400")}>{value}</p>
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

/** "Company" or the client's name — every record clearly shows who it belongs to. */
export function OwnerBadge({ scope, clientId, clientName, link = true }: { scope: Scope; clientId: string | null; clientName: string | null; link?: boolean }) {
  if (scope === "company") {
    const chip = (
      <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/15">
        <Building2 className="size-3" />
        Company
      </Badge>
    );
    return link ? <Link href="/cybervault/company">{chip}</Link> : chip;
  }
  const chip = (
    <Badge variant="outline" className="max-w-44 gap-1">
      <User className="size-3 shrink-0" />
      <span className="truncate">{clientName ?? "Client"}</span>
    </Badge>
  );
  return link && clientId ? <Link href={`/cybervault/clients/${clientId}`}>{chip}</Link> : chip;
}

export function ExpiryBadge({ state, date }: { state: ExpiryState; date: string | null }) {
  if (state === "none" || !date) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = {
    expired: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    expiring: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    valid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  }[state];
  const text = state === "expired" ? "Expired" : state === "expiring" ? "Expiring" : "Valid";
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge className={cls}>{text}</Badge>
      <span className="text-[11px] text-muted-foreground tabular-nums">{date}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: RecordStatus }) {
  return status === "archived" ? <Badge variant="outline" className="text-muted-foreground">Archived</Badge> : <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Active</Badge>;
}
