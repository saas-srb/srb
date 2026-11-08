import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import PanelFilterBar from "@/components/platform/panel/PanelFilterBar";
import StatusBadge, { PriorityBadge } from "@/components/support/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { getCompanyCaller } from "@/lib/support/caller";
import { getSupportConfig, labelOf, stateOf, statusOf } from "@/lib/support/config";
import { listForCompany } from "@/lib/support/requests";
import type { StatusState } from "@/lib/support/types";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
const STATES: StatusState[] = ["open", "waiting", "resolved", "closed"];

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const caller = await getCompanyCaller();
  if (!caller) redirect("/commandos/login");
  const sp = await searchParams;
  const state = STATES.includes(sp.state as StatusState) ? (sp.state as StatusState) : "all";
  const [cfg, rows] = await Promise.all([getSupportConfig(), listForCompany(caller.companyId, { state, q: sp.q })]);

  return (
    <div className="space-y-4">
      <PanelDashboardHeader
        title="My Requests"
        description={`Support requests, bug reports, feature requests and feedback from ${caller.companyName}.`}
        actions={<Link href="/resolveiq/requests/new" className={buttonVariants({ size: "sm" })}><PlusCircle className="size-3.5" data-icon="inline-start" /> New request</Link>}
        filters={
          <PanelFilterBar
            title="Search & Filters"
            description="Find a request by number or title"
            fields={[
              { key: "q", label: "Search", type: "search", placeholder: "Title or request number…" },
              { key: "state", label: "Status", type: "select", allLabel: "All statuses", options: [{ value: "open", label: "Open" }, { value: "waiting", label: "Waiting for you" }, { value: "resolved", label: "Resolved" }, { value: "closed", label: "Closed" }] },
            ]}
          />
        }
      />
      {rows.length === 0 ? (
        <GlassCard interactive={false} className="p-8 text-center text-sm text-muted-foreground">No requests yet. <Link href="/resolveiq/requests/new" className="text-primary hover:underline">Send your first one</Link>.</GlassCard>
      ) : (
        <GlassCard interactive={false} className="divide-y divide-border/50 overflow-hidden p-0">
          {rows.map((r) => (
            <Link key={r._id} href={`/resolveiq/requests/${r._id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
              <span className="w-14 shrink-0 text-xs font-semibold text-muted-foreground">#{r.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{r.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{labelOf(cfg.types, r.type)} · {r.createdBy.email} · updated {formatDateTime(r.updatedAt)}</span>
              </span>
              <PriorityBadge label={labelOf(cfg.priorities, r.priority)} />
              <StatusBadge label={statusOf(cfg, r.status)?.label ?? r.status} state={stateOf(cfg, r.status)} />
            </Link>
          ))}
        </GlassCard>
      )}
    </div>
  );
}
