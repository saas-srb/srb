import PanelTabs from "@/components/platform/panel/PanelTabs";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { panelNameMap } from "@/lib/platform/panels/store";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { canViewAuditLog, canViewWorkspaceEvents } from "@/lib/products/commandos/nav";
import { listEventActors, listEvents } from "@/lib/platform/events";
import { EVENT_TYPES, eventLabel, isEventType } from "@/lib/platform/events/catalog";
import { searchActivityLog, getActivityActions, ACTIVITY_LOG_MODULES, type ActivityLogModule } from "@/lib/products/commandos/activity-log";
import { searchMergedAudit } from "@/lib/products/commandos/audit-log";
import { AUDIT_SOURCE_LABELS, allowedAuditSources, resolveAuditSource, type AuditSource } from "@/lib/products/commandos/activity-log-shared";
import { formatDateTime } from "@/lib/utils";
import EventsFilterBar from "./EventsFilterBar";
import PanelActivityFilterBar from "./PanelActivityFilterBar";
import PanelActivityGrid from "./PanelActivityGrid";
import MergedAuditGrid from "./MergedAuditGrid";
import AuditAllFilterBar from "./AuditAllFilterBar";

export const metadata: Metadata = { title: "Audit log", robots: { index: false, follow: false } };

type SP = {
  source?: string;
  page?: string;
  // Workspace events (the old Company → Activity log)
  type?: string;
  actor?: string;
  from?: string;
  to?: string;
  // Product activity (the old Management → Activity log)
  search?: string;
  module?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
};
const EVENTS_PAGE_SIZE = 50;
const PANELS_PAGE_SIZE = 25;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(value: string | undefined, endOfDay: boolean): Date | undefined {
  if (!value || !DAY.test(value)) return undefined;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Company → Audit log: the one place for "who did what, and when".
 *
 *  - Workspace events: what the event bus recorded (leads, projects, invoices,
 *    imports …, kept 180 days). Company Director only, as before.
 *  - Product activity: the products' own audit trails (Procurement, Projects, Team
 *    Chat, Training, HR, External Portal, Online Tests) with their filters and
 *    CSV export. Needs the Audit log permission, as before.
 *  - All: both in one timeline — offered only to people who may read both.
 * The source a person may use is decided here on the server; the `source`
 * parameter can only narrow it, never widen it.
 */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireWorkspaceAccess("company.audit");
  const access = { panels: canViewAuditLog(user), workspace: canViewWorkspaceEvents(user) };
  const sp = await searchParams;
  if (sp.source === "panels") {
    const canonicalParams = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value !== undefined) canonicalParams.set(key, value);
    canonicalParams.set("source", "products");
    redirect(`/commandos/settings/audit-log?${canonicalParams.toString()}`);
  }
  const source = resolveAuditSource(sp.source, access);
  if (!source) notFound();
  const tabs = allowedAuditSources(access);

  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  // Each source's own date parameters win (old bookmarks use `from`/`to` for workspace events, `dateFrom`/`dateTo` for product activity).
  const dateFrom = source === "workspace" ? (sp.from ?? sp.dateFrom) : (sp.dateFrom ?? sp.from);
  const dateTo = source === "workspace" ? (sp.to ?? sp.dateTo) : (sp.dateTo ?? sp.to);
  const tabHref = (s: AuditSource) => {
    const params = new URLSearchParams({ source: s });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/commandos/settings/audit-log?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Company", href: "/commandos/settings" }, { label: "Audit log" }]}
        title={<>Audit log</>}
        description={<>Who did what across your workspace and its products, and when.</>}
      />

      {tabs.length > 1 && (
        <PanelTabs label="Audit log source" active={source} tabs={tabs.map((s) => ({ key: s, label: AUDIT_SOURCE_LABELS[s], href: tabHref(s) }))} />
      )}

      {source === "products" && <PanelActivity sp={sp} page={page} from={dateFrom} to={dateTo} />}
      {source === "workspace" && <WorkspaceEvents sp={sp} page={page} from={dateFrom} to={dateTo} />}
      {source === "all" && <AllSources page={page} from={dateFrom} to={dateTo} />}
    </div>
  );
}

// ── Product activity ───────────────────────────────────────────────────────────

async function PanelActivity({ sp, page, from, to }: { sp: SP; page: number; from?: string; to?: string }) {
  const moduleFilter = (ACTIVITY_LOG_MODULES as readonly string[]).includes(sp.module ?? "") ? (sp.module as ActivityLogModule) : undefined;
  const [{ items, total, totalPages }, actions] = await Promise.all([
    searchActivityLog({ page, pageSize: PANELS_PAGE_SIZE, search: sp.search, module: moduleFilter, action: sp.action, dateFrom: day(from, false), dateTo: day(to, true) }),
    getActivityActions(),
  ]);
  const panelName = await panelNameMap();
  const names = ACTIVITY_LOG_MODULES.map((m) => panelName(m, m));
  const moduleNames = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
  const hasActiveFilters = Boolean(sp.search || moduleFilter || sp.action || from || to);
  const exportParams = new URLSearchParams();
  if (sp.search) exportParams.set("search", sp.search);
  if (moduleFilter) exportParams.set("module", moduleFilter);
  if (sp.action) exportParams.set("action", sp.action);
  if (from) exportParams.set("dateFrom", from);
  if (to) exportParams.set("dateTo", to);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total} event{total === 1 ? "" : "s"} across {moduleNames}.
      </p>
      <PanelActivityGrid
        rows={items}
        total={total}
        page={page}
        totalPages={totalPages}
        hasActiveFilters={hasActiveFilters}
        exportHref={`/api/commandos/activity-log/export?${exportParams.toString()}`}
        filters={<PanelActivityFilterBar initialSearch={sp.search ?? ""} initialModule={moduleFilter ?? ""} initialAction={sp.action ?? ""} actions={actions} initialDateFrom={from ?? ""} initialDateTo={to ?? ""} />}
      />
    </div>
  );
}

// ── Workspace events ─────────────────────────────────────────────────────────

async function WorkspaceEvents({ sp, page, from, to }: { sp: SP; page: number; from?: string; to?: string }) {
  const type = isEventType(sp.type) ? sp.type : "";
  const [list, actors] = await Promise.all([
    listEvents({ types: type ? [type] : undefined, actorId: sp.actor || undefined, from: day(from, false), to: day(to, true) }, { limit: EVENTS_PAGE_SIZE, skip: (page - 1) * EVENTS_PAGE_SIZE }),
    listEventActors(),
  ]);
  const totalPages = Math.max(1, Math.ceil(list.total / EVENTS_PAGE_SIZE));
  const pageHref = (p: number) => {
    const params = new URLSearchParams({ source: "workspace" });
    for (const [k, v] of Object.entries({ type, actor: sp.actor, from, to })) if (v) params.set(k, v);
    if (p > 1) params.set("page", String(p));
    return `/commandos/settings/audit-log?${params.toString()}`;
  };

  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-xl">
          <h2>Workspace events</h2>
        </CardTitle>
        <CardDescription>What happened across your workspace — who did what, and when. Kept for 180 days.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <EventsFilterBar initial={{ type, actor: sp.actor ?? "", from: from ?? "", to: to ?? "" }} types={EVENT_TYPES.map((t) => ({ value: t.type, label: t.label }))} actors={actors} />

        <p id="activity-count" className="text-xs text-muted-foreground">
          {list.total.toLocaleString("en-IN")} {list.total === 1 ? "event" : "events"}
        </p>

        {list.items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing matches these filters yet.</p>
        ) : (
          <ul id="activity-list" className="divide-y rounded-xl border">
            {list.items.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-baseline sm:gap-3" data-event-type={e.type}>
                <span className="shrink-0 text-xs text-muted-foreground sm:w-40">{formatDateTime(e.at)}</span>
                <span className="min-w-0 flex-1 text-sm break-words">
                  <span className="font-medium">{eventLabel(e.type)}</span>
                  {e.label && (
                    <>
                      {": "}
                      {e.url ? (
                        <Link href={e.url} className="text-primary underline-offset-4 hover:underline">
                          {e.label}
                        </Link>
                      ) : (
                        e.label
                      )}
                    </>
                  )}
                  {e.source === "import" && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">import</span>}
                </span>
                <span className="shrink-0 text-xs break-all text-muted-foreground">{e.actorEmail ?? (e.actorId ? "Someone" : "Automatic")}</span>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <nav className="flex items-center justify-between text-sm" aria-label="Pages">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-primary hover:underline">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-primary hover:underline">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </CardContent>
    </GlassCard>
  );
}

// ── All ──────────────────────────────────────────────────────────────────────

async function AllSources({ page, from, to }: { page: number; from?: string; to?: string }) {
  const res = await searchMergedAudit({ page, pageSize: PANELS_PAGE_SIZE, from: day(from, false), to: day(to, true), panels: true, workspace: true });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {res.total.toLocaleString("en-IN")} record{res.total === 1 ? "" : "s"}: workspace events and product activity, newest first.
        {res.truncated && " Only the newest records of each source are paged here; narrow the dates, or pick a source, to go further back."}
      </p>
      <MergedAuditGrid
        rows={res.items}
        total={res.total}
        page={Math.min(page, res.totalPages)}
        totalPages={res.totalPages}
        hasActiveFilters={Boolean(from || to)}
        filters={<AuditAllFilterBar initialDateFrom={from ?? ""} initialDateTo={to ?? ""} />}
      />
    </div>
  );
}
