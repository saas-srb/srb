import type { PageSection } from "@/lib/products/sitecraft-ai/section-registry";

/** One difference between two versions of a page's section list (WordPress-style revision compare, at section level). */
export interface SectionChange {
  kind: "added" | "removed" | "edited" | "moved" | "shown" | "hidden";
  id: string;
  type: string;
  config: Record<string, unknown>;
  /** For "edited": the top-level fields whose value changed. */
  fields?: string[];
}

const byOrder = (list: PageSection[]) => [...list].sort((a, b) => a.orderKey - b.orderKey);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What changed going from `from` (e.g. a published version) to `to` (e.g. the current draft). */
export function diffSections(from: PageSection[], to: PageSection[]): SectionChange[] {
  const before = byOrder(from);
  const after = byOrder(to);
  const beforeById = new Map(before.map((s) => [s.id, s]));
  const afterIds = new Set(after.map((s) => s.id));
  // Relative order of the sections present in both versions — a section counts as moved only if that changed.
  const sharedBefore = before.filter((s) => afterIds.has(s.id)).map((s) => s.id);
  const sharedAfter = after.filter((s) => beforeById.has(s.id)).map((s) => s.id);

  const changes: SectionChange[] = [];
  for (const s of after) {
    const old = beforeById.get(s.id);
    const base = { id: s.id, type: s.type, config: s.config };
    if (!old) {
      changes.push({ kind: "added", ...base });
      continue;
    }
    if (old.enabled !== s.enabled) changes.push({ kind: s.enabled ? "shown" : "hidden", ...base });
    const keys = [...new Set([...Object.keys(old.config ?? {}), ...Object.keys(s.config ?? {})])];
    const fields = keys.filter((k) => !same(old.config?.[k], s.config?.[k]));
    if (fields.length) changes.push({ kind: "edited", ...base, fields });
    if (sharedBefore.indexOf(s.id) !== sharedAfter.indexOf(s.id)) changes.push({ kind: "moved", ...base });
  }
  for (const s of before) if (!afterIds.has(s.id)) changes.push({ kind: "removed", id: s.id, type: s.type, config: s.config });
  return changes;
}
