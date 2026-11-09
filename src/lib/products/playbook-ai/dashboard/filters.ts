/**
 * Playbook dashboard filters: what the Search & Filters card can narrow the figures by, read from the URL, applied to the rows BEFORE the
 * aggregation so tiles, charts and attention lists all agree. Pure and client-safe.
 */
import type { ActivityRow, DashDocStatus, DashKind, DashboardInput, DocRow, SendRow } from "@/lib/products/playbook-ai/dashboard/types";

export interface PbFilters { q: string; type: "" | DashKind; category: string; department: string; status: string; creator: string; source: "" | "library" | "scratch" }
export const EMPTY_PB_FILTERS: PbFilters = { q: "", type: "", category: "", department: "", status: "", creator: "", source: "" };
export const PB_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" }, { value: "in_review", label: "In review" }, { value: "approved", label: "Approved" }, { value: "issued", label: "Issued" }, { value: "archived", label: "Archived" },
  { value: "sent", label: "Sent for signature" }, { value: "signed", label: "Signed" },
];
export const PB_TYPE_OPTIONS: { value: string; label: string }[] = [{ value: "sop", label: "SOP" }, { value: "document", label: "Document" }, { value: "kpi", label: "KPI sheet" }];
export const PB_SOURCE_OPTIONS: { value: string; label: string }[] = [{ value: "library", label: "Library or template" }, { value: "scratch", label: "From scratch" }];

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? "";
const clean = (v: string, max = 80): string => v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);

export function parsePbFilters(sp: Record<string, string | string[] | undefined>): PbFilters {
  const type = one(sp.type);
  const source = one(sp.source);
  const status = one(sp.status);
  return {
    q: clean(one(sp.q)), type: type === "sop" || type === "document" || type === "kpi" ? type : "", category: clean(one(sp.category)), department: clean(one(sp.department)),
    status: PB_STATUS_OPTIONS.some((o) => o.value === status) ? status : "", creator: clean(one(sp.creator), 64), source: source === "library" || source === "scratch" ? source : "",
  };
}
export const countPbFilters = (f: PbFilters): number => Object.values(f).filter((v) => v !== "").length;
export const pbFiltersKey = (f: PbFilters): string => JSON.stringify(f);

export interface PbFilterOptions { categories: string[]; departments: string[]; creators: { id: string; name: string }[] }
/** The choices the selects offer, from the rows in the person's scope (so a filter can never offer something they cannot see). */
export function pbFilterOptions(input: DashboardInput): PbFilterOptions {
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const ids = [...new Set(input.docs.map((d) => d.createdBy).filter((x): x is string => !!x))];
  return { categories: uniq(input.docs.map((d) => d.category)), departments: uniq(input.docs.map((d) => d.department)), creators: ids.map((id) => ({ id, name: input.names[id] ?? "Someone" })).sort((a, b) => a.name.localeCompare(b.name)) };
}

function docMatches(d: DocRow, f: PbFilters, names: Record<string, string>, sendsByDoc: Map<string, SendRow[]>): boolean {
  if (f.type && d.kind !== f.type) return false;
  if (f.category && d.category !== f.category) return false;
  if (f.department && d.department !== f.department) return false;
  if (f.creator && d.createdBy !== f.creator) return false;
  if (f.source === "library" && !d.templateId) return false;
  if (f.source === "scratch" && d.templateId) return false;
  if (f.status) {
    const s = sendsByDoc.get(d.id) ?? [];
    if (f.status === "sent") { if (s.length === 0) return false; }
    else if (f.status === "signed") { if (!s.some((x) => x.signedAt !== null)) return false; }
    else if (d.status !== (f.status as DashDocStatus)) return false;
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    const who = d.createdBy ? (names[d.createdBy] ?? "") : "";
    if (!d.title.toLowerCase().includes(q) && !who.toLowerCase().includes(q)) return false;
  }
  return true;
}

/** Narrows every list to the filters: documents first, then what belongs to the kept documents (sends, AI runs, activity); exports by creator only. Pure. */
export function applyPbFilters(input: DashboardInput, f: PbFilters): DashboardInput {
  if (countPbFilters(f) === 0) return input;
  const sendsByDoc = new Map<string, SendRow[]>();
  for (const s of input.sends) sendsByDoc.set(s.documentId, [...(sendsByDoc.get(s.documentId) ?? []), s]);
  const docs = input.docs.filter((d) => docMatches(d, f, input.names, sendsByDoc));
  const ids = new Set(docs.map((d) => d.id));
  const keepAct = (a: ActivityRow): boolean => (a.documentId ? ids.has(a.documentId) : false);
  return {
    docs,
    sends: input.sends.filter((s) => ids.has(s.documentId)),
    ai: input.ai.filter((a) => ids.has(a.documentId)),
    exports: f.creator ? input.exports.filter((e) => e.actorId === f.creator) : input.exports,
    activity: input.activity.filter(keepAct),
    names: input.names,
  };
}
