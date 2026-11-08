import "server-only";
import { listClientRefs } from "@/lib/products/cybervault/access";
import type { DlmsViewer } from "@/lib/products/cybervault/viewer";
import type { RecordQuery } from "@/lib/products/cybervault/records";
import { EXPIRY_FILTERS, SCOPE_LABEL, SCOPES, type Option } from "@/lib/products/cybervault/constants";

export type SearchParams = Record<string, string | undefined>;

/** Query-string → list query (the data layer re-validates everything; this only shapes it). */
export function queryFrom(sp: SearchParams): RecordQuery {
  return {
    q: sp.q?.trim() || undefined,
    scope: sp.scope === "company" || sp.scope === "client" ? sp.scope : undefined,
    clientId: sp.client || undefined,
    category: sp.category || undefined,
    status: sp.status === "archived" || sp.status === "all" ? sp.status : undefined,
    expiry: EXPIRY_FILTERS.some((e) => e.value === sp.expiry) ? sp.expiry : undefined,
    sort: sp.sort === "name" || sp.sort === "updated" || sp.sort === "expiry" ? sp.sort : undefined,
  };
}

/** Clients the viewer may see, as select options (managers: all; employees: only assigned). */
export async function visibleClientOptions(viewer: DlmsViewer): Promise<Option[]> {
  const all = await listClientRefs();
  const list = viewer.seesAll ? all : all.filter((c) => viewer.clientIds.includes(c._id));
  return list.map((c) => ({ value: c._id, label: c.companyName }));
}

export const SCOPE_OPTIONS: Option[] = SCOPES.map((s) => ({ value: s, label: SCOPE_LABEL[s] }));
export const STATUS_OPTIONS: Option[] = [
  { value: "archived", label: "Archived" },
  { value: "all", label: "All (incl. archived)" },
];
