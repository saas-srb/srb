/** Catalogue lookups: list, get, search. Pure and client-safe. */
import { ALL_META } from "@/lib/products/playbook-ai/catalogue/meta";
import { ALL_TEMPLATES } from "@/lib/products/playbook-ai/catalogue/templates";
import { CATEGORY_LABELS, type CatalogueEntry, type CatalogueMeta, type CategoryKey, type PartyType, type TemplateDef } from "@/lib/products/playbook-ai/catalogue/types";

const DEF_BY_ID = new Map(ALL_TEMPLATES.map((t) => [t.id, t]));
const META_BY_ID = new Map(ALL_META.map((m) => [m.id, m]));

export interface CatalogueFilter {
  category?: CategoryKey;
  party?: PartyType;
  /** Only types that have full template content. */
  withContent?: boolean;
  legalReview?: boolean;
  needsSignature?: boolean;
}

/** Every catalogue type in plan order, with whether full content exists. */
export function listCatalogue(filter: CatalogueFilter = {}): CatalogueEntry[] {
  return ALL_META
    .filter((m) =>
      (!filter.category || m.category === filter.category) &&
      (!filter.party || m.party === filter.party) &&
      (filter.legalReview === undefined || m.legal.review === filter.legalReview) &&
      (filter.needsSignature === undefined || m.needsSignature === filter.needsSignature))
    .map((meta) => ({ meta, hasContent: DEF_BY_ID.has(meta.id) }))
    .filter((e) => !filter.withContent || e.hasContent);
}

export function getCatalogueMeta(id: string): CatalogueMeta | null {
  return META_BY_ID.get(id) ?? null;
}

/** The full template for a type, or null when only the metadata exists yet. */
export function getTemplateDef(id: string): TemplateDef | null {
  return DEF_BY_ID.get(id) ?? null;
}

/**
 * Case-insensitive search over id, name, purpose, category label, inputs and sections. Every word must match; name and id matches rank first.
 */
export function searchCatalogue(query: string, filter: CatalogueFilter = {}): CatalogueEntry[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const entries = listCatalogue(filter);
  if (words.length === 0) return entries;
  const scored: Array<{ e: CatalogueEntry; score: number }> = [];
  for (const e of entries) {
    const m = e.meta;
    const head = `${m.id} ${m.name}`.toLowerCase();
    const rest = `${m.purpose} ${CATEGORY_LABELS[m.category]} ${m.inputsSummary.join(" ")} ${m.sectionsSummary.join(" ")}`.toLowerCase();
    let score = 0;
    let all = true;
    for (const w of words) {
      if (head.includes(w)) score += head.startsWith(w) || head.includes(` ${w}`) ? 4 : 3;
      else if (rest.includes(w)) score += 1;
      else { all = false; break; }
    }
    if (all) scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.e);
}
