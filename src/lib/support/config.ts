import "server-only";
import { configCol } from "@/lib/support/db";
import type { FieldDef, OptionDef, RequestTypeDef, StatusDef, StatusState, SupportConfig } from "@/lib/support/types";

/**
 * The Help & Support Center's configuration — request types (and their form fields), categories, priorities,
 * severities, teams and the status workflow — lives in ONE document (`support_config` / `_id: "main"`) that SelfRun AI
 * edits in the Platform Console. The values below are only the starter set written the first time it is read; nothing in
 * the code refers to a particular type, priority or status by name (the workflow works from each status's `state`).
 */

const opt = (key: string, label: string): OptionDef => ({ key, label, active: true });

const STARTER: SupportConfig = {
  types: [
    { key: "help", label: "Help Request", description: "Ask how something works", kind: "general", active: true, fields: [] },
    { key: "technical", label: "Technical Support", description: "Something isn't working as expected", kind: "general", active: true, fields: [] },
    { key: "bug", label: "Bug Report", description: "Report a problem or error", kind: "bug", active: true, fields: [{ key: "steps", label: "Steps to reproduce", type: "textarea" }, { key: "expected", label: "What did you expect?", type: "text" }] },
    { key: "feature", label: "Feature Request", description: "Suggest a new capability", kind: "general", active: true, fields: [{ key: "businessNeed", label: "Business need", type: "textarea" }] },
    { key: "improvement", label: "Feature Improvement", description: "Improve something that exists", kind: "general", active: true, fields: [] },
    { key: "feedback", label: "Feedback", description: "Share what you think", kind: "general", active: true, fields: [] },
    { key: "other", label: "Other", description: "Anything else", kind: "general", active: true, fields: [] },
  ],
  categories: [opt("how-to", "How-to"), opt("account", "Account & access"), opt("billing", "Billing"), opt("integration", "Integrations"), opt("performance", "Performance"), opt("ui-ux", "UI / UX")],
  priorities: [opt("low", "Low"), opt("normal", "Normal"), opt("high", "High"), opt("urgent", "Urgent")],
  severities: [opt("minor", "Minor"), opt("major", "Major"), opt("critical", "Critical")],
  teams: [opt("support", "Support"), opt("engineering", "Engineering"), opt("product", "Product")],
  statuses: [
    { key: "submitted", label: "Submitted", state: "open", initial: true },
    { key: "triaged", label: "Triaged", state: "open" },
    { key: "in-progress", label: "In Progress", state: "open" },
    { key: "waiting", label: "Waiting for User", state: "waiting" },
    { key: "resolved", label: "Resolved", state: "resolved" },
    { key: "closed", label: "Closed", state: "closed" },
  ],
};

const ID = "main";

export async function getSupportConfig(): Promise<SupportConfig> {
  const col = await configCol();
  const doc = await col.findOne({ _id: ID });
  if (doc) return normalizeConfig(doc as unknown as Partial<SupportConfig>);
  await col.updateOne({ _id: ID }, { $setOnInsert: { ...STARTER, updatedAt: new Date() } }, { upsert: true });
  return STARTER;
}

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const STATES: StatusState[] = ["open", "waiting", "resolved", "closed"];
const FIELD_TYPES = ["text", "textarea", "select"] as const;
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

function options(list: unknown): OptionDef[] {
  const seen = new Set<string>();
  const out: OptionDef[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const r = raw as Partial<OptionDef>;
    const key = clean(r.key, 40).toLowerCase();
    const label = clean(r.label, 60);
    if (!KEY_RE.test(key) || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label, active: r.active !== false });
  }
  return out;
}

function fields(list: unknown): FieldDef[] {
  const seen = new Set<string>();
  const out: FieldDef[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const r = raw as Partial<FieldDef>;
    const key = clean(r.key, 40);
    const label = clean(r.label, 80);
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key) || !label || seen.has(key)) continue;
    seen.add(key);
    const type = FIELD_TYPES.includes(r.type as never) ? (r.type as FieldDef["type"]) : "text";
    out.push({ key, label, type, required: r.required === true, ...(type === "select" ? { options: (Array.isArray(r.options) ? r.options : []).map((o) => clean(o, 60)).filter(Boolean).slice(0, 30) } : {}) });
  }
  return out.slice(0, 20);
}

/** Cleans a (possibly hand-edited) config; throws a readable error if it would leave the workflow unusable. */
export function normalizeConfig(input: Partial<SupportConfig>): SupportConfig {
  const types: RequestTypeDef[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(input.types) ? input.types : []) {
    const key = clean(raw?.key, 40).toLowerCase();
    const label = clean(raw?.label, 60);
    if (!KEY_RE.test(key) || !label || seen.has(key)) continue;
    seen.add(key);
    types.push({ key, label, description: clean(raw?.description, 160) || undefined, kind: raw?.kind === "bug" ? "bug" : "general", active: raw?.active !== false, fields: fields(raw?.fields) });
  }
  const statuses: StatusDef[] = [];
  const sSeen = new Set<string>();
  for (const raw of Array.isArray(input.statuses) ? input.statuses : []) {
    const key = clean(raw?.key, 40).toLowerCase();
    const label = clean(raw?.label, 60);
    if (!KEY_RE.test(key) || !label || sSeen.has(key) || !STATES.includes(raw?.state as StatusState)) continue;
    sSeen.add(key);
    statuses.push({ key, label, state: raw.state, ...(raw.initial ? { initial: true } : {}) });
  }
  return { types, categories: options(input.categories), priorities: options(input.priorities), severities: options(input.severities), teams: options(input.teams), statuses };
}

export function validateConfig(cfg: SupportConfig): string | null {
  if (!cfg.types.some((t) => t.active)) return "Keep at least one active request type.";
  if (!cfg.priorities.some((p) => p.active)) return "Keep at least one active priority.";
  for (const state of STATES) if (!cfg.statuses.some((s) => s.state === state)) return `The workflow needs at least one status in the “${state}” state.`;
  return null;
}

export async function saveSupportConfig(input: Partial<SupportConfig>): Promise<{ ok: true; config: SupportConfig } | { ok: false; error: string }> {
  const cfg = normalizeConfig(input);
  const problem = validateConfig(cfg);
  if (problem) return { ok: false, error: problem };
  await (await configCol()).updateOne({ _id: ID }, { $set: { ...cfg, updatedAt: new Date() } }, { upsert: true });
  return { ok: true, config: cfg };
}

export { statusOf, initialStatus, firstStatusIn, stateOf, labelOf } from "@/lib/support/helpers";
