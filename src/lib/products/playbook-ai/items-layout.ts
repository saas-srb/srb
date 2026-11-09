import type { LayoutInput } from "@/lib/products/playbook-ai/doc/layout";
import { formatIsoDateIndia } from "@/lib/products/playbook-ai/doc/format";
import type { ItemKind, ItemMeta } from "@/lib/products/playbook-ai/items-types";

const todayIso = (now: Date = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** What the kind layout needs from a Playbook item or a ContractFlow clone of one. Pure helper (no database). */
export function layoutInputFor(x: {
  kind?: ItemKind | null;
  title: string;
  docTypeId?: string | null;
  docNumber?: string | null;
  meta?: ItemMeta | null;
  version?: number | string | null;
  authorName?: string | null;
  dateIso?: string;
  changeSummary?: string | null;
}): LayoutInput {
  const iso = x.dateIso ?? todayIso();
  return {
    kind: x.kind ?? "document",
    title: x.title,
    docTypeId: x.docTypeId ?? null,
    docNumber: x.docNumber ?? null,
    version: x.version === null || x.version === undefined ? "1" : String(x.version),
    dateText: formatIsoDateIndia(iso) ?? iso,
    owner: null,
    department: x.meta?.department ?? null,
    designation: x.meta?.designation ?? null,
    reviewPeriod: x.meta?.reviewPeriod ?? null,
    preparedBy: x.authorName ?? null,
    approvedBy: null,
    classification: null,
    changeSummary: x.changeSummary ?? null,
  };
}
