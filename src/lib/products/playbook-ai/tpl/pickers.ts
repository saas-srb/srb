import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { canManageEmployees } from "@/lib/hrms-roles";
import { canManageClients, canManageProjects } from "@/lib/pms-roles";
import { canManageProcurement } from "@/lib/prms-roles";
import { EMPLOYEES_COLLECTION } from "@/lib/products/talentos/employees";
import { APPLICATIONS_COLLECTION } from "@/lib/career-applications";
import type { PbActor } from "@/lib/products/playbook-ai/documents-types";
import type { PickerNamespace } from "@/lib/products/playbook-ai/catalogue/types";

/**
 * Record search for the "person" inputs of a template form. Server-only.
 * The permission is the one `checkLink` applies when the record is linked (HR for employees and candidates, client management for clients,
 * procurement for vendors, project management for projects), so the picker can never show a record the person could not link. The
 * database layer is company-scoped, so only the current company's records are searched.
 */

export interface PickerItem { id: string; label: string; detail: string }
export type PickerKind = Exclude<PickerNamespace, "party">;
export const PICKER_KINDS: readonly PickerKind[] = ["employee", "candidate", "client", "vendor", "project"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function searchRecords(actor: PbActor, kind: PickerKind, q: string, limit = 12): Promise<{ ok: true; items: PickerItem[] } | { ok: false; error: string }> {
  if (!PICKER_KINDS.includes(kind)) return { ok: false, error: "Unknown record type." };
  const allowed = kind === "employee" || kind === "candidate" ? canManageEmployees(actor) : kind === "client" ? canManageClients(actor) : kind === "vendor" ? canManageProcurement(actor) : canManageProjects(actor);
  if (!allowed) return { ok: false, error: `You are not allowed to use ${kind} records in documents.` };
  const term = q.trim().slice(0, 60);
  const re = term ? { $regex: esc(term), $options: "i" } : null;
  const db = await getDb();
  const n = Math.min(Math.max(limit, 1), 25);
  switch (kind) {
    case "employee": {
      const rows = await db.collection(EMPLOYEES_COLLECTION).find({ deletedAt: null, ...(re ? { $or: [{ firstName: re }, { lastName: re }, { employeeCode: re }, { workEmail: re }] } : {}) } as never).sort({ firstName: 1 }).limit(n).toArray();
      return { ok: true, items: rows.map((r) => ({ id: String(r._id), label: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || String(r.workEmail), detail: [r.employeeCode, r.workEmail].filter(Boolean).join(" · ") })) };
    }
    case "candidate": {
      const rows = await db.collection(APPLICATIONS_COLLECTION).find((re ? { $or: [{ name: re }, { email: re }, { positionTitle: re }] } : {}) as never).sort({ createdAt: -1 }).limit(n).toArray();
      return { ok: true, items: rows.filter((r) => ObjectId.isValid(String(r._id))).map((r) => ({ id: String(r._id), label: String(r.name ?? r.email), detail: [r.positionTitle, r.email].filter(Boolean).join(" · ") })) };
    }
    case "client": {
      const rows = await db.collection("pms_clients").find({ deletedAt: null, ...(re ? { $or: [{ companyName: re }, { clientCode: re }] } : {}) } as never).sort({ companyName: 1 }).limit(n).toArray();
      return { ok: true, items: rows.map((r) => ({ id: String(r._id), label: String(r.companyName), detail: String(r.clientCode ?? "") })) };
    }
    case "vendor": {
      const rows = await db.collection("prms_vendors").find({ deletedAt: null, ...(re ? { $or: [{ companyName: re }, { vendorCode: re }] } : {}) } as never).sort({ companyName: 1 }).limit(n).toArray();
      return { ok: true, items: rows.map((r) => ({ id: String(r._id), label: String(r.companyName), detail: String(r.vendorCode ?? "") })) };
    }
    case "project": {
      const rows = await db.collection("pms_projects").find({ deletedAt: null, ...(re ? { $or: [{ name: re }, { projectCode: re }] } : {}) } as never).sort({ name: 1 }).limit(n).toArray();
      return { ok: true, items: rows.map((r) => ({ id: String(r._id), label: String(r.name), detail: String(r.projectCode ?? "") })) };
    }
  }
}
