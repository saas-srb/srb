import "server-only";
import { getDb } from "@/lib/mongodb";
import { emitEvent } from "@/lib/platform/events";
import { escapeRegExp } from "@/lib/text-search";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  formatCode,
  type AuditFields,
} from "@/lib/products/sprintos/db";
import { DEFAULT_CLIENT_STATUS, type ClientStatus } from "@/lib/products/sprintos/constants";

export const CLIENTS_COLLECTION = "pms_clients";
const PROJECTS_COLLECTION = "pms_projects";
const CLIENT_CODE_PREFIX = "CLI";

export interface ClientContact {
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
}

export interface ClientBilling {
  addressLine: string | null;
  city: string | null;
  country: string | null;
  /** The customer's state in India: with its GSTIN it decides CGST + SGST or IGST on a sale. */
  state?: string | null;
  gstin: string | null;
  currency: string;
  paymentTermsDays: number | null;
}

export interface Client extends AuditFields {
  _id: string;
  clientCode: string;
  companyName: string;
  industry: string | null;
  website: string | null;
  status: ClientStatus;
  primaryContact: ClientContact;
  billing: ClientBilling;
  notes: string | null;
  tags: string[];
}

export interface SerializedClient extends Omit<Client, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeClient(c: Client): SerializedClient {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Client>(CLIENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ clientCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ companyName: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateClientCode(): Promise<string> {
  const seq = await nextSequence("client_code");
  return formatCode(CLIENT_CODE_PREFIX, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getClient(id: string): Promise<Client | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

/** Lightweight list for pickers (project form client dropdown). */
export async function listClientOptions(): Promise<{ _id: string; clientCode: string; companyName: string }[]> {
  const collection = await getCollection();
  const docs = await collection
    .find(notDeleted, { projection: { companyName: 1, clientCode: 1 } })
    .sort({ companyName: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, clientCode: d.clientCode, companyName: d.companyName }));
}

export interface ClientFilter {
  search?: string;
  status?: ClientStatus;
  industry?: string;
}

function buildFilter(opts: ClientFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [
      { companyName: rx },
      { clientCode: rx },
      { "primaryContact.name": rx },
      { "primaryContact.email": rx },
      { industry: rx },
    ];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.industry) filter.industry = opts.industry;
  return filter;
}

export interface SearchClientsOptions extends ClientFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "companyName" | "clientCode" | "status";
  sortDir?: "asc" | "desc";
}

export async function searchClients(opts: SearchClientsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const sortField =
    opts.sortBy === "companyName"
      ? "companyName"
      : opts.sortBy === "clientCode"
        ? "clientCode"
        : opts.sortBy === "status"
          ? "status"
          : "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [rawItems, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  // Attach a project count per client for the directory table.
  const db = await getDb();
  const projects = db.collection(PROJECTS_COLLECTION);
  const ids = rawItems.map((c) => c._id);
  const counts = ids.length
    ? await projects
        .aggregate<{ _id: string; count: number }>([
          { $match: { clientId: { $in: ids }, deletedAt: null } },
          { $group: { _id: "$clientId", count: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const countMap = new Map(counts.map((r) => [r._id, r.count]));
  const items = rawItems.map((c) => ({ ...c, projectCount: countMap.get(c._id) ?? 0 }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportClients(opts: ClientFilter & { ids?: string[] } = {}): Promise<Client[]> {
  const collection = await getCollection();
  const filter =
    opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

export async function listIndustries(): Promise<string[]> {
  const collection = await getCollection();
  const values = await collection.distinct("industry", notDeleted);
  return values.filter((v): v is string => typeof v === "string" && v.length > 0).sort();
}

export async function countClients(filter: ClientFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface ClientWriteData {
  companyName: string;
  industry: string | null;
  website: string | null;
  status: ClientStatus;
  primaryContact: ClientContact;
  billing: ClientBilling;
  notes: string | null;
  tags: string[];
}

export async function createClient(data: ClientWriteData, actorId: string): Promise<Client> {
  const collection = await getCollection();
  const doc: Client = {
    _id: newId(),
    clientCode: await generateClientCode(),
    companyName: data.companyName,
    industry: data.industry,
    website: data.website,
    status: data.status ?? DEFAULT_CLIENT_STATUS,
    primaryContact: data.primaryContact,
    billing: data.billing,
    notes: data.notes,
    tags: data.tags ?? [],
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await emitEvent("client.created", { entity: { type: "client", id: doc._id, label: doc.companyName, url: `/sprintos/clients/${doc._id}` }, actorId, data: { companyName: doc.companyName, clientCode: doc.clientCode, contactName: doc.primaryContact.name, contactEmail: doc.primaryContact.email, industry: doc.industry } });
  return doc;
}

export async function updateClient(
  id: string,
  data: Partial<ClientWriteData>,
  actorId: string
): Promise<Client | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

/** Soft-delete. Refuses when projects still reference the client. */
export async function deleteClient(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const db = await getDb();
  const projects = db.collection(PROJECTS_COLLECTION);
  const projectCount = await projects.countDocuments({ clientId: id, deletedAt: null });
  if (projectCount > 0) {
    return { ok: false, reason: `${projectCount} project(s) still belong to this client. Reassign or remove them first.` };
  }
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}
