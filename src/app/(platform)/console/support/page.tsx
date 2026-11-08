import type { Metadata } from "next";
import Link from "next/link";
import { CircleDot, Hourglass, CheckCircle2, UserX, Inbox } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import StatusBadge, { PriorityBadge } from "@/components/support/StatusBadge";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getSupportConfig, labelOf, stateOf, statusOf } from "@/lib/support/config";
import { listAllRequests, supportStats } from "@/lib/support/requests";
import type { StatusState } from "@/lib/support/types";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Support requests" };
export const dynamic = "force-dynamic";

const STATES: StatusState[] = ["open", "waiting", "resolved", "closed"];

export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePlatformPermission("support.read");
  const sp = await searchParams;
  const state = STATES.includes(sp.state as StatusState) ? (sp.state as StatusState) : "all";
  const [cfg, stats, list, companies] = await Promise.all([
    getSupportConfig(),
    supportStats(),
    listAllRequests({ q: sp.q, state, type: sp.type, priority: sp.priority, companyId: sp.company, assignee: sp.assignee === "me" ? user.id : sp.assignee, page: Number(sp.page) || 1 }),
    (await getPlatformDb()).collection<{ _id: string; name: string }>("companies").find({}, { projection: { name: 1 } }).sort({ name: 1 }).limit(500).toArray(),
  ]);
  const pageHref = (p: number) => {
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
    qs.set("page", String(p));
    return `/console/resolveiq?${qs.toString()}`;
  };

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="Support requests" description="Help requests, bug reports, feature requests and feedback from every company, in one place." crumbs={[{ label: "Support" }]} />

      <KpiGrid>
        <KpiCard label="Open" value={stats.byState.open} icon={<CircleDot className="size-4" />} accent />
        <KpiCard label="Waiting for company" value={stats.byState.waiting} icon={<Hourglass className="size-4" />} />
        <KpiCard label="Unassigned (open)" value={stats.unassigned} icon={<UserX className="size-4" />} />
        <KpiCard label="Resolved / closed" value={stats.byState.resolved + stats.byState.closed} icon={<CheckCircle2 className="size-4" />} />
      </KpiGrid>

      <PanelFilterBar
        title="Search & Filters"
        description="Find a request by number, title, company or sender"
        fields={[
          { key: "q", label: "Search", type: "search", placeholder: "Title, company, email or #number…" },
          { key: "state", label: "Status", type: "select", allLabel: "All statuses", options: STATES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
          { key: "type", label: "Type", type: "select", allLabel: "All types", options: cfg.types.map((t) => ({ value: t.key, label: t.label })) },
          { key: "priority", label: "Priority", type: "select", allLabel: "All priorities", options: cfg.priorities.map((p) => ({ value: p.key, label: p.label })) },
          { key: "company", label: "Company", type: "select", allLabel: "All companies", options: companies.map((c) => ({ value: String(c._id), label: c.name })) },
          { key: "assignee", label: "Assigned to", type: "select", allLabel: "Anyone", options: [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }] },
        ]}
      />

      {list.rows.length === 0 ? (
        <GlassCard interactive={false} className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground"><Inbox className="size-6" /> No requests match.</GlassCard>
      ) : (
        <GlassCard interactive={false} className="divide-y divide-border/50 overflow-hidden p-0">
          {list.rows.map((r) => (
            <Link key={r._id} href={`/console/resolveiq/${r._id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
              <span className="w-14 shrink-0 text-xs font-semibold text-muted-foreground">#{r.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.prioritySupport ? "★ Priority · " : ""}{r.companyName} · {labelOf(cfg.types, r.type)} · {r.createdBy.email} · {formatDateTime(r.updatedAt)}{r.assignee ? ` · ${r.assignee.email}` : " · unassigned"}</span>
              </span>
              {r.lastActor === "company" && stateOf(cfg, r.status) === "open" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Awaiting us</span>}
              <PriorityBadge label={labelOf(cfg.priorities, r.priority)} />
              <StatusBadge label={statusOf(cfg, r.status)?.label ?? r.status} state={stateOf(cfg, r.status)} />
            </Link>
          ))}
        </GlassCard>
      )}

      {list.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{list.total} requests · page {list.page} of {list.totalPages}</span>
          <span className="flex gap-3">
            {list.page > 1 && <Link href={pageHref(list.page - 1)} className="text-primary hover:underline">← Previous</Link>}
            {list.page < list.totalPages && <Link href={pageHref(list.page + 1)} className="text-primary hover:underline">Next →</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
