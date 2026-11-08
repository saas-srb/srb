import type { FieldDef } from "@/components/products/playbook-ai/EditDialog";
import type { Keyword } from "@/lib/products/rankmax-ai/keywords";

/** Field set for the keyword add/edit dialog (shared by the list and detail pages). */
export function keywordFields(groups: { value: string; label: string }[], users: { value: string; label: string }[]): FieldDef[] {
  const opts = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }));
  return [
    { key: "keyword", label: "Keyword", type: "text", maxLength: 200 },
    { key: "targetUrl", label: "Target URL", type: "text", placeholder: "/services/web-development" },
    { key: "type", label: "Type", type: "select", options: opts(["primary", "secondary"]) },
    { key: "intent", label: "Search intent", type: "select", noneLabel: "Unknown", options: opts(["informational", "navigational", "commercial", "transactional"]) },
    { key: "priority", label: "Priority", type: "select", options: opts(["low", "medium", "high", "critical"]) },
    { key: "status", label: "Status", type: "select", options: opts(["tracking", "paused", "archived"]) },
    { key: "targetPosition", label: "Target position", type: "number", min: 1, max: 100 },
    { key: "volume", label: "Search volume / month (est.)", type: "number", min: 0 },
    { key: "difficulty", label: "Keyword difficulty 0–100 (est.)", type: "number", min: 0, max: 100 },
    { key: "cpc", label: "CPC (est.)", type: "number", min: 0, step: 0.01 },
    { key: "competition", label: "Competition 0–1 (est.)", type: "number", min: 0, max: 1, step: 0.01 },
    { key: "metricsSource", label: "Metrics source", type: "text", placeholder: "e.g. Google Keyword Planner" },
    { key: "country", label: "Country (ISO-2)", type: "text", maxLength: 2 },
    { key: "language", label: "Language", type: "text", maxLength: 5 },
    { key: "device", label: "Device", type: "select", options: opts(["desktop", "mobile"]) },
    { key: "engine", label: "Search engine", type: "text", maxLength: 30 },
    { key: "groupId", label: "Keyword group", type: "select", noneLabel: "No group", options: groups },
    { key: "cluster", label: "Cluster", type: "text", maxLength: 100, placeholder: "Topic cluster name" },
    { key: "assigneeId", label: "Assigned to", type: "select", noneLabel: "Unassigned", options: users },
    { key: "relatedKeywords", label: "Related keywords (comma-separated)", type: "textarea", rows: 2 },
    { key: "notes", label: "Notes", type: "textarea", rows: 2 },
  ];
}

export function keywordInitial(k: Keyword | null, defaults: { country: string; language: string; device: string; engine: string }): Record<string, string> {
  const n = (x: number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  return {
    keyword: k?.keyword ?? "",
    targetUrl: k?.targetUrl ?? "",
    type: k?.type ?? "primary",
    intent: k?.intent ?? "",
    priority: k?.priority ?? "medium",
    status: k?.status ?? "tracking",
    targetPosition: n(k?.targetPosition),
    volume: n(k?.volume),
    difficulty: n(k?.difficulty),
    cpc: n(k?.cpc),
    competition: n(k?.competition),
    metricsSource: k?.metricsSource ?? "manual",
    country: k?.country ?? defaults.country,
    language: k?.language ?? defaults.language,
    device: k?.device ?? defaults.device,
    engine: k?.engine ?? defaults.engine,
    groupId: k?.groupId ?? "",
    cluster: k?.cluster ?? "",
    assigneeId: k?.assigneeId ?? "",
    relatedKeywords: k?.relatedKeywords.join(", ") ?? "",
    notes: k?.notes ?? "",
  };
}
