import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { accessibleAreas, type AccessUser, type Area } from "@/lib/platform/access";
import { LEAD_RECORDS_COLLECTION } from "@/lib/lead-management/records";
import { CLIENTS_COLLECTION } from "@/lib/products/sprintos/clients";
import { PROJECTS_COLLECTION } from "@/lib/products/sprintos/projects";
import { TASKS_COLLECTION } from "@/lib/products/sprintos/tasks";
import { EMPLOYEES_COLLECTION } from "@/lib/products/talentos/employees";
import { INVOICES_COLLECTION } from "@/lib/products/cashflow-ai/invoices";

/**
 * Global search (the Cmd/Ctrl+K palette): one escaped, case-insensitive
 * match per record type, run in parallel straight against each product's own
 * collection — no search index. Company-scoped by `getDb()`, and limited to
 * the areas the person may see (`access.ts`).
 */

export const SEARCH_TYPES = ["lead", "client", "project", "task", "employee", "invoice"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string;
  url: string;
}

export const SEARCH_MIN_LENGTH = 2;
const PER_TYPE = 5;

type Doc = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");

interface Source {
  type: SearchType;
  area: Area;
  collection: string;
  fields: string[];
  hit(d: Doc): Omit<SearchHit, "type" | "id">;
}

const SOURCES: Source[] = [
  { type: "lead", area: "leads", collection: LEAD_RECORDS_COLLECTION, fields: ["name", "email", "phone", "code"], hit: (d) => ({ title: s(d.name), subtitle: [s(d.code), s(d.email)].filter(Boolean).join(" · "), url: `/dealflow-ai/leads/${d._id}` }) },
  {
    type: "client",
    area: "clients",
    collection: CLIENTS_COLLECTION,
    fields: ["companyName", "clientCode", "primaryContact.name", "primaryContact.email"],
    hit: (d) => ({ title: s(d.companyName), subtitle: [s(d.clientCode), s((d.primaryContact as Doc | undefined)?.name)].filter(Boolean).join(" · "), url: `/sprintos/clients/${d._id}` }),
  },
  { type: "project", area: "projects", collection: PROJECTS_COLLECTION, fields: ["name", "projectCode"], hit: (d) => ({ title: s(d.name), subtitle: s(d.projectCode), url: `/sprintos/projects/${d._id}` }) },
  { type: "task", area: "tasks", collection: TASKS_COLLECTION, fields: ["title", "taskCode"], hit: (d) => ({ title: s(d.title), subtitle: s(d.taskCode), url: `/sprintos/projects/${d.projectId}/tasks/${d._id}` }) },
  {
    type: "employee",
    area: "employees",
    collection: EMPLOYEES_COLLECTION,
    fields: ["firstName", "lastName", "workEmail", "employeeCode"],
    hit: (d) => ({ title: `${s(d.firstName)} ${s(d.lastName)}`.trim(), subtitle: [s(d.employeeCode), s(d.workEmail)].filter(Boolean).join(" · "), url: `/talentos/employees/${d._id}` }),
  },
  {
    type: "invoice",
    area: "invoices",
    collection: INVOICES_COLLECTION,
    fields: ["invoiceNumber", "customerName"],
    hit: (d) => ({ title: s(d.invoiceNumber), subtitle: s(d.customerName), url: `/cashflow-ai/invoices/${d._id}` }),
  },
];

export async function globalSearch(user: Pick<AccessUser, "roles">, query: string, opts: { perType?: number } = {}): Promise<SearchHit[]> {
  const q = typeof query === "string" ? query.trim().slice(0, 80) : "";
  if (q.length < SEARCH_MIN_LENGTH) return [];
  const areas = await accessibleAreas(user);
  const sources = SOURCES.filter((src) => areas.has(src.area));
  if (sources.length === 0) return [];

  const db = await getDb();
  const words = q.split(/\s+/).filter(Boolean).slice(0, 4);
  const limit = Math.min(Math.max(opts.perType ?? PER_TYPE, 1), PER_TYPE);
  const results = await Promise.allSettled(
    sources.map(async (src) => {
      // Every word must match some field ("asha verma" finds firstName Asha + lastName Verma).
      const filter = { deletedAt: null, $and: words.map((w) => ({ $or: src.fields.map((f) => ({ [f]: new RegExp(escapeRegExp(w), "i") })) })) };
      const docs = await db.collection(src.collection).find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
      return docs.map((d): SearchHit => ({ type: src.type, id: String(d._id), ...src.hit(d as Doc) }));
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
