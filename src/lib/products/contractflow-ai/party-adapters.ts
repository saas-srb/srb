import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { canManageClients } from "@/lib/pms-roles";
import { canManageFinance, canManageProcurement } from "@/lib/prms-roles";
import { canViewAllEmployees } from "@/lib/hrms-roles";
import { isLpmsAdmin } from "@/lib/lpms-roles";
import type { LpmsViewer } from "./types";
import type { LinkedPartyType, PartyRecordRef } from "./party-types";

/**
 * Read-only adapters to the systems of record. They never write to another product and never copy a record: they search it and resolve it
 * by id, on every call, so a renamed or deleted source is seen as it is now. Every query runs through the company-scoped `getDb()`.
 */

export interface SourceRecord {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  subtitle: string | null;
}

export interface PartyAdapter {
  type: LinkedPartyType;
  ref: Omit<PartyRecordRef, "id">;
  /** Who may pick or read these records (the source product's own rule, plus ContractFlow admins). */
  canAccess: (v: LpmsViewer) => boolean;
  search: (q: string, limit: number) => Promise<SourceRecord[]>;
  resolve: (id: string) => Promise<SourceRecord | null>;
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ctx = (v: LpmsViewer) => ({ roles: v.roles, permissionOverrides: v.overrides });
/** Legal / admin see every party type. Deliberately NOT "manager tier": HR implies that tier and must not gain clients and vendors. */
const seesAll = (v: LpmsViewer) => isLpmsAdmin(ctx(v));
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const cap = (n: number) => Math.min(Math.max(Math.floor(n) || 10, 1), 25);

interface ClientRow { _id: string; companyName: string; clientCode?: string; primaryContact?: { name?: string; email?: string; phone?: string } }
const clientAdapter: PartyAdapter = {
  type: "client",
  ref: { product: "sprintos", collection: "pms_clients" },
  canAccess: (v) => canManageClients(ctx(v)) || seesAll(v),
  async search(q, limit) {
    const re = new RegExp(escapeRegex(q), "i");
    const rows = await (await getDb()).collection<ClientRow>("pms_clients").find({ deletedAt: null, ...(q ? { $or: [{ companyName: re }, { clientCode: re }, { "primaryContact.name": re }, { "primaryContact.email": re }] } : {}) } as never).sort({ companyName: 1 }).limit(cap(limit)).toArray();
    return rows.map(toClient);
  },
  async resolve(id) {
    const row = await (await getDb()).collection<ClientRow>("pms_clients").findOne({ _id: id, deletedAt: null } as never);
    return row ? toClient(row) : null;
  },
};
const toClient = (r: ClientRow): SourceRecord => ({ id: String(r._id), displayName: r.companyName, email: str(r.primaryContact?.email), phone: str(r.primaryContact?.phone), subtitle: str(r.primaryContact?.name) });

interface VendorRow { _id: string; companyName: string; vendorCode?: string; email?: string; phone?: string; contactPerson?: string }
const vendorAdapter: PartyAdapter = {
  type: "vendor",
  ref: { product: "spendiq", collection: "prms_vendors" },
  canAccess: (v) => canManageProcurement(ctx(v)) || canManageFinance(ctx(v)) || seesAll(v),
  async search(q, limit) {
    const re = new RegExp(escapeRegex(q), "i");
    const rows = await (await getDb()).collection<VendorRow>("prms_vendors").find({ deletedAt: null, ...(q ? { $or: [{ companyName: re }, { vendorCode: re }, { email: re }] } : {}) } as never).sort({ companyName: 1 }).limit(cap(limit)).toArray();
    return rows.map(toVendor);
  },
  async resolve(id) {
    const row = await (await getDb()).collection<VendorRow>("prms_vendors").findOne({ _id: id, deletedAt: null } as never);
    return row ? toVendor(row) : null;
  },
};
const toVendor = (r: VendorRow): SourceRecord => ({ id: String(r._id), displayName: r.companyName, email: str(r.email), phone: str(r.phone), subtitle: str(r.vendorCode) });

interface EmployeeRow { _id: string; firstName?: string; lastName?: string; workEmail?: string; employeeCode?: string; phone?: string; status?: string }
const employeeName = (r: EmployeeRow) => [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.workEmail || String(r._id);
const toEmployee = (r: EmployeeRow): SourceRecord => ({ id: String(r._id), displayName: employeeName(r), email: str(r.workEmail), phone: str(r.phone), subtitle: str(r.employeeCode) });
const employeeAdapter: PartyAdapter = {
  type: "employee",
  ref: { product: "talentos", collection: "hrms_employees" },
  // Employee records are HR data: only people who may see every employee (HR), plus ContractFlow admins.
  canAccess: (v) => canViewAllEmployees(ctx(v)) || seesAll(v),
  async search(q, limit) {
    const re = new RegExp(escapeRegex(q), "i");
    const rows = await (await getDb()).collection<EmployeeRow>("hrms_employees").find({ deletedAt: null, ...(q ? { $or: [{ firstName: re }, { lastName: re }, { workEmail: re }, { employeeCode: re }] } : {}) } as never).sort({ firstName: 1 }).limit(cap(limit)).toArray();
    return rows.map(toEmployee);
  },
  async resolve(id) {
    const row = await (await getDb()).collection<EmployeeRow>("hrms_employees").findOne({ _id: id, deletedAt: null } as never);
    return row ? toEmployee(row) : null;
  },
};

interface ApplicationRow { _id: ObjectId; name: string; email?: string; phone?: string; positionTitle?: string }
const toCandidate = (r: ApplicationRow): SourceRecord => ({ id: r._id.toHexString(), displayName: r.name, email: str(r.email), phone: str(r.phone), subtitle: str(r.positionTitle) });
const candidateAdapter: PartyAdapter = {
  type: "candidate",
  ref: { product: "talentos", collection: "career_applications" },
  canAccess: (v) => canViewAllEmployees(ctx(v)) || seesAll(v),
  async search(q, limit) {
    const re = new RegExp(escapeRegex(q), "i");
    const rows = await (await getDb()).collection<ApplicationRow>("career_applications").find((q ? { $or: [{ name: re }, { email: re }, { positionTitle: re }] } : {}) as never, { projection: { resume: 0 } }).sort({ _id: -1 }).limit(cap(limit)).toArray();
    return rows.map(toCandidate);
  },
  async resolve(id) {
    if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id.toLowerCase()) return null;
    const row = await (await getDb()).collection<ApplicationRow>("career_applications").findOne({ _id: new ObjectId(id) } as never, { projection: { resume: 0 } });
    return row ? toCandidate(row) : null;
  },
};

export const PARTY_ADAPTERS: Record<LinkedPartyType, PartyAdapter> = { client: clientAdapter, vendor: vendorAdapter, employee: employeeAdapter, candidate: candidateAdapter };
