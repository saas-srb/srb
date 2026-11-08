import { panelNameMap } from "@/lib/platform/panels/store";
import "server-only";
import { listEvents } from "@/lib/platform/events";
import { eventLabel } from "@/lib/platform/events/catalog";
import { activityModuleLabel, mergeAuditRows, MAX_MERGED_PAGES, type AuditRow } from "@/lib/products/commandos/activity-log-shared";
import { searchActivityLog } from "@/lib/products/commandos/activity-log";

/**
 * The merged ("All") view of the Audit log: workspace events (the event bus,
 * `platform_events`) and product activity (the products' own audit collections),
 * newest first, one page at a time. Each source is asked for its newest
 * `page * pageSize` rows and the union is cut to the page, so the order is exact.
 * Callers pass only the sources the reader may see.
 */
export async function searchMergedAudit(opts: { page: number; pageSize: number; from?: Date; to?: Date; panels: boolean; workspace: boolean }): Promise<{ items: AuditRow[]; total: number; totalPages: number; truncated: boolean }> {
  const page = Math.min(Math.max(opts.page, 1), MAX_MERGED_PAGES);
  const need = page * opts.pageSize;
  const [panelRes, eventRes] = await Promise.all([
    opts.panels ? searchActivityLog({ page: 1, pageSize: need, dateFrom: opts.from, dateTo: opts.to }) : null,
    opts.workspace ? listEvents({ from: opts.from, to: opts.to }, { limit: need, skip: 0 }) : null,
  ]);
  const panelName = await panelNameMap();
  const panelRows: AuditRow[] = (panelRes?.items ?? []).map((r) => ({
    id: `products:${r._id}`,
    source: "products",
    at: r.createdAt,
    what: `${panelName(r.module, activityModuleLabel(r.module))} · ${r.action.replace(/_/g, " ")}`,
    subject: `${r.entity.replace(/_/g, " ")}${r.entityLabel ? `: ${r.entityLabel}` : ""}`,
    summary: r.summary,
    actor: r.actorEmail ?? "System",
    url: null,
  }));
  const eventRows: AuditRow[] = (eventRes?.items ?? []).map((e) => ({
    id: `workspace:${e.id}`,
    source: "workspace",
    at: e.at,
    what: eventLabel(e.type),
    subject: e.label ?? "",
    summary: null,
    actor: e.actorEmail ?? (e.actorId ? "Someone" : "Automatic"),
    url: e.url,
  }));
  const total = (panelRes?.total ?? 0) + (eventRes?.total ?? 0);
  const merged = mergeAuditRows(panelRows, eventRows);
  const maxRows = MAX_MERGED_PAGES * opts.pageSize;
  return {
    items: merged.slice((page - 1) * opts.pageSize, page * opts.pageSize),
    total,
    totalPages: Math.max(1, Math.ceil(Math.min(total, maxRows * 2) / opts.pageSize)),
    truncated: (panelRes?.total ?? 0) > maxRows || (eventRes?.total ?? 0) > maxRows,
  };
}
