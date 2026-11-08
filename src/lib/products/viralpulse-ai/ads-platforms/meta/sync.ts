import type { MetaClient } from "./client";

/** Status + review feedback + insights readers and parsers (pure parsing is exported for fixture tests). */

export type ObjectLevel = "campaign" | "adset" | "ad";

export interface ObjectStatus {
  id: string;
  level: ObjectLevel;
  status: string | null;
  effectiveStatus: string | null;
  /** Raw review feedback / issues, trimmed to short strings. */
  issues: string[];
  disapproved: boolean;
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 300) : JSON.stringify(v).slice(0, 300);
}

/** `ad_review_feedback` is `{ global: { "<reason>": "<detail>" }, placement_specific: {...} }`; `issues_info` is a list. The page does not define either, so read defensively. */
export function parseIssues(row: { ad_review_feedback?: unknown; issues_info?: unknown }): string[] {
  const out: string[] = [];
  const fb = row.ad_review_feedback;
  if (fb && typeof fb === "object") {
    for (const grp of Object.values(fb as Record<string, unknown>)) {
      if (grp && typeof grp === "object") for (const [k, v] of Object.entries(grp as Record<string, unknown>)) out.push(`${k}: ${trimStr(v)}`);
      else if (typeof grp === "string") out.push(grp);
    }
  }
  if (Array.isArray(row.issues_info)) {
    for (const i of row.issues_info) {
      const x = i as { error_summary?: string; error_message?: string; level?: string };
      const t = x.error_summary || x.error_message;
      if (t) out.push(trimStr(t));
    }
  }
  return [...new Set(out)].slice(0, 8);
}

export async function readStatuses(c: MetaClient, level: ObjectLevel, ids: string[]): Promise<Map<string, ObjectStatus>> {
  const map = new Map<string, ObjectStatus>();
  const fields = level === "ad" ? "status,effective_status,ad_review_feedback,issues_info" : "status,effective_status";
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const r = await c.get<Record<string, { id?: string; status?: string; effective_status?: string; ad_review_feedback?: unknown; issues_info?: unknown }>>("", { ids: batch.join(","), fields });
    for (const [id, row] of Object.entries(r ?? {})) {
      if (!row || typeof row !== "object") continue;
      const eff = row.effective_status ?? null;
      map.set(id, { id, level, status: row.status ?? null, effectiveStatus: eff, issues: parseIssues(row), disapproved: eff === "DISAPPROVED" });
    }
  }
  return map;
}

export const INSIGHT_FIELDS = ["impressions", "reach", "clicks", "inline_link_clicks", "spend", "cpc", "cpm", "ctr", "frequency", "actions", "cost_per_action_type", "purchase_roas"] as const;

export interface InsightRow {
  level: ObjectLevel;
  externalId: string;
  date: string;
  metric: string;
  value: number;
}

interface RawInsight {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  date_start?: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
  purchase_roas?: { action_type: string; value: string }[];
  [k: string]: unknown;
}

/** Flattens insight rows to one value per metric. `actions` become `action:<type>` metrics, costs `cost_per:<type>`. Spend is in the account currency's major unit as Meta reports it. */
export function parseInsights(level: ObjectLevel, rows: RawInsight[]): InsightRow[] {
  const out: InsightRow[] = [];
  for (const r of rows) {
    const id = level === "campaign" ? r.campaign_id : level === "adset" ? r.adset_id : r.ad_id;
    if (!id || !r.date_start) continue;
    const push = (metric: string, raw: unknown) => {
      const v = typeof raw === "string" ? Number(raw) : raw;
      if (typeof v === "number" && Number.isFinite(v)) out.push({ level, externalId: id, date: r.date_start!, metric, value: v });
    };
    for (const f of ["impressions", "reach", "clicks", "inline_link_clicks", "spend", "cpc", "cpm", "ctr", "frequency"]) push(f, r[f]);
    for (const a of r.actions ?? []) push(`action:${a.action_type}`, a.value);
    for (const a of r.cost_per_action_type ?? []) push(`cost_per:${a.action_type}`, a.value);
    for (const a of r.purchase_roas ?? []) push(`roas:${a.action_type}`, a.value);
  }
  return out;
}

/** Daily insights for the campaigns of one ad account at one level. */
export async function readInsights(c: MetaClient, actId: string, level: ObjectLevel, campaignIds: string[], sinceDay: string, untilDay: string): Promise<InsightRow[]> {
  if (!campaignIds.length) return [];
  const idField = level === "campaign" ? "campaign_id" : level === "adset" ? "adset_id,campaign_id" : "ad_id,adset_id,campaign_id";
  const rows = await c.getAll<RawInsight>(`${actId}/insights`, {
    level,
    time_increment: 1,
    time_range: { since: sinceDay, until: untilDay },
    fields: `${idField},${INSIGHT_FIELDS.join(",")}`,
    filtering: [{ field: "campaign.id", operator: "IN", value: campaignIds }],
    limit: 500,
  }, 20);
  return parseInsights(level, rows);
}
