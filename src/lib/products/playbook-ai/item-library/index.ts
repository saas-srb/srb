/**
 * The prebuilt library of SOPs and KPI sheets (P2). Pure: no database. `listLibrary` returns the listing rows; `buildLibraryDoc` compiles one
 * entry into a PBDoc for preview or for "Use". Document-kind entries are the catalogue templates and are listed by the catalogue code.
 */
import { kpiBody, rawToDoc, sopBody } from "@/lib/products/playbook-ai/item-library/build";
import { SOP_PREREQUISITES } from "@/lib/products/playbook-ai/item-library/sop-prerequisites";
import { KPI_SPECS } from "@/lib/products/playbook-ai/item-library/kpis";
import { SOPS_BUSINESS_TECH } from "@/lib/products/playbook-ai/item-library/sops-business-tech";
import { SOPS_PEOPLE_FINANCE } from "@/lib/products/playbook-ai/item-library/sops-people-finance";
import { SOPS_SUPPORT_QUALITY } from "@/lib/products/playbook-ai/item-library/sops-support-quality";
import type { PBDoc } from "@/lib/products/playbook-ai/doc/types";
import type { ItemKind, ItemMeta, LibraryEntryInfo } from "@/lib/products/playbook-ai/items-types";

const SOPS = [...SOPS_PEOPLE_FINANCE, ...SOPS_BUSINESS_TECH, ...SOPS_SUPPORT_QUALITY];

/** SOPs and KPI sheets (not documents) in library order. */
export function listLibrary(kind: "sop" | "kpi"): LibraryEntryInfo[] {
  return kind === "sop"
    ? SOPS.map((s) => ({ id: s.id, kind: "sop", title: s.title, category: s.department, summary: s.summary }))
    : KPI_SPECS.map((k) => ({ id: k.id, kind: "kpi", title: k.title, category: k.department, summary: k.summary }));
}

export interface LibraryBuilt { info: LibraryEntryInfo; meta: ItemMeta; doc: PBDoc }

export function buildLibraryDoc(id: string): LibraryBuilt | null {
  const s = SOPS.find((x) => x.id === id);
  if (s) return { info: { id: s.id, kind: "sop", title: s.title, category: s.department, summary: s.summary }, meta: { department: s.department, description: s.summary, libraryId: s.id }, doc: rawToDoc(sopBody(s, SOP_PREREQUISITES[s.id] ?? [])) };
  const k = KPI_SPECS.find((x) => x.id === id);
  if (k) return { info: { id: k.id, kind: "kpi", title: `${k.title} KPI Sheet`, category: k.department, summary: k.summary }, meta: { department: k.department, designation: k.title, description: k.summary, reviewPeriod: "Annual", libraryId: k.id }, doc: rawToDoc(kpiBody(k)) };
  return null;
}

export const libraryKindOf = (id: string): ItemKind | null => (id.startsWith("sop.") ? "sop" : id.startsWith("kpi.") ? "kpi" : null);
