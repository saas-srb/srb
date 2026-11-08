import "server-only";
import { cache } from "react";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/playbook-ai/db";
import { DEFAULT_CATEGORIES, DEFAULT_DEPARTMENTS } from "@/lib/products/playbook-ai/constants";
import { listHrmsDepartments } from "@/lib/products/playbook-ai/people";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

/**
 * SOP structure: Department → Function → Process → Sub-Process. Everything is
 * data (seeded once, then fully editable), so departments, functions,
 * categories and processes are configurable and any future department can be
 * added. A department may be LINKED to an HRMS department (`hrmsDepartmentId`)
 * — that link is how HRMS membership drives access and assignment. New HRMS
 * departments are mirrored in automatically by `syncFromHrms`.
 */

export interface SopDepartment extends AuditFields {
  _id: string;
  name: string;
  code: string;
  description: string;
  hrmsDepartmentId: string | null;
  active: boolean;
}
export interface SopFunction extends AuditFields {
  _id: string;
  departmentId: string;
  name: string;
  description: string;
  active: boolean;
}
/** A process, or — when `parentId` is set — a sub-process of that process. */
export interface SopProcess extends AuditFields {
  _id: string;
  departmentId: string;
  functionId: string;
  parentId: string | null;
  name: string;
  description: string;
  active: boolean;
}
export interface SopCategory extends AuditFields {
  _id: string;
  name: string;
  color: string;
  description: string;
  active: boolean;
}

// A small starter hierarchy so the tree is not empty on day one — all editable.
const STARTER_FUNCTIONS: Record<string, { name: string; processes: { name: string; subs?: string[] }[] }[]> = {
  HR: [
    { name: "Talent Lifecycle", processes: [{ name: "Employee Onboarding", subs: ["Documentation", "IT Provisioning"] }, { name: "Employee Exit" }] },
    { name: "Leave & Attendance", processes: [{ name: "Leave Management" }, { name: "Attendance Regularisation" }] },
  ],
  FIN: [
    { name: "Payables", processes: [{ name: "Vendor Payment", subs: ["Invoice Verification", "Payment Release"] }, { name: "Expense Reimbursement" }] },
    { name: "Receivables", processes: [{ name: "Invoicing" }, { name: "Collections" }] },
  ],
  ENG: [
    { name: "Delivery", processes: [{ name: "Code Review" }, { name: "Release Management", subs: ["Hotfix Release"] }] },
  ],
  DEV: [
    { name: "Infrastructure", processes: [{ name: "Deployment" }, { name: "Incident Response" }, { name: "Backup & Restore" }] },
  ],
  SAL: [{ name: "Pipeline", processes: [{ name: "Lead Qualification" }, { name: "Proposal & Negotiation" }] }],
  CS: [{ name: "Ticketing", processes: [{ name: "Ticket Triage" }, { name: "Escalation Handling" }] }],
  PRC: [{ name: "Sourcing", processes: [{ name: "Vendor Onboarding" }, { name: "Purchase Order Creation" }] }],
  SEC: [{ name: "Security Operations", processes: [{ name: "Access Provisioning" }, { name: "Security Incident Handling" }] }],
};

// Per company: each company's workspace seeds and syncs independently.
const seedPromises = new Map<string, Promise<void>>();
const lastSyncAt = new Map<string, number>();

async function cols() {
  const db = await getDb();
  return {
    departments: db.collection<SopDepartment>(COLLECTIONS.departments),
    functions: db.collection<SopFunction>(COLLECTIONS.functions),
    processes: db.collection<SopProcess>(COLLECTIONS.processes),
    categories: db.collection<SopCategory>(COLLECTIONS.categories),
  };
}

let indexesEnsured = false;
async function ensureIndexes() {
  if (indexesEnsured) return;
  indexesEnsured = true;
  const c = await cols();
  await Promise.all([
    c.departments.createIndex({ code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } }).catch(() => {}),
    c.departments.createIndex({ hrmsDepartmentId: 1 }).catch(() => {}),
    c.functions.createIndex({ departmentId: 1 }).catch(() => {}),
    c.processes.createIndex({ functionId: 1 }).catch(() => {}),
    c.processes.createIndex({ parentId: 1 }).catch(() => {}),
  ]);
}

function slugCode(name: string, taken: Set<string>): string {
  const base = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 4) || "DEP";
  let code = base;
  let i = 2;
  while (taken.has(code)) code = `${base}${i++}`;
  return code;
}

/**
 * Idempotent first-run seed (departments, starter functions/processes,
 * categories) + HRMS mirror. Safe under concurrent calls (single in-flight
 * promise) and cheap on repeat calls (throttled).
 */
export async function ensureSopSeeded(): Promise<void> {
  const companyId = await currentCompanyId();
  const inFlight = seedPromises.get(companyId);
  if (inFlight) return inFlight;
  const seedPromise = (async () => {
    try {
      await ensureIndexes();
      const c = await cols();
      const systemActor = null;

      // Each collection seeds independently, so a database that already has some of them (e.g. departments
      // created by the demo seeder) still gets the rest.
      if ((await c.departments.countDocuments({})) === 0) {
        await c.departments.insertMany(
          DEFAULT_DEPARTMENTS.map((d) => ({
            _id: newId(),
            name: d.name,
            code: d.code,
            description: "",
            hrmsDepartmentId: null,
            active: true,
            ...createStamp(systemActor),
          })),
          { ordered: false }
        ).catch(() => {}); // a concurrent instance seeded first — the unique code index makes this safe
      }
      if ((await c.functions.countDocuments({})) === 0) {
        const depts = await c.departments.find(notDeleted).toArray();
        const byCode = new Map(depts.map((d) => [d.code, d]));
        for (const [code, funcs] of Object.entries(STARTER_FUNCTIONS)) {
          const dept = byCode.get(code);
          if (!dept) continue;
          for (const f of funcs) {
            const fn: SopFunction = { _id: newId(), departmentId: dept._id, name: f.name, description: "", active: true, ...createStamp(systemActor) };
            await c.functions.insertOne(fn);
            for (const p of f.processes) {
              const proc: SopProcess = { _id: newId(), departmentId: dept._id, functionId: fn._id, parentId: null, name: p.name, description: "", active: true, ...createStamp(systemActor) };
              await c.processes.insertOne(proc);
              for (const sub of p.subs ?? []) {
                await c.processes.insertOne({ _id: newId(), departmentId: dept._id, functionId: fn._id, parentId: proc._id, name: sub, description: "", active: true, ...createStamp(systemActor) });
              }
            }
          }
        }
      }
      if ((await c.categories.countDocuments({})) === 0) {
        await c.categories.insertMany(DEFAULT_CATEGORIES.map((cat) => ({ _id: newId(), ...cat, active: true, ...createStamp(systemActor) }))).catch(() => {});
      }
      await syncFromHrms(true);
      const { seedSystemTemplates } = await import("@/lib/products/playbook-ai/templates");
      await seedSystemTemplates();
    } catch (err) {
      seedPromises.delete(companyId); // let the next request retry a failed seed
      throw err;
    }
  })();
  // On success keep the resolved promise for a minute (cheap repeat calls), then re-check —
  // that also re-seeds if the database was truncated while the server kept running.
  seedPromises.set(companyId, seedPromise);
  seedPromise.then(() => setTimeout(() => seedPromises.delete(companyId), 60_000).unref?.()).catch(() => {});
  return seedPromise;
}

/**
 * Mirrors HRMS departments into the SOP structure: links an unlinked SOP
 * department with the same name, otherwise creates a new SOP department, so
 * a department added in HRMS tomorrow is SOP-ready with no manual step.
 */
export async function syncFromHrms(force = false): Promise<void> {
  const companyId = await currentCompanyId();
  if (!force && Date.now() - (lastSyncAt.get(companyId) ?? 0) < 60_000) return;
  lastSyncAt.set(companyId, Date.now());
  const c = await cols();
  const [hrms, all] = await Promise.all([listHrmsDepartments(), c.departments.find(notDeleted).toArray()]);
  const linked = new Set(all.map((d) => d.hrmsDepartmentId).filter(Boolean));
  const takenCodes = new Set(all.map((d) => d.code));
  for (const h of hrms) {
    if (linked.has(h._id)) continue;
    const match = all.find((d) => !d.hrmsDepartmentId && d.name.trim().toLowerCase() === h.name.trim().toLowerCase());
    if (match) {
      await c.departments.updateOne({ _id: match._id }, { $set: { hrmsDepartmentId: h._id, ...updateStamp(null) } });
      match.hrmsDepartmentId = h._id;
      continue;
    }
    const code = slugCode(h.code || h.name, takenCodes);
    takenCodes.add(code);
    await c.departments.insertOne({
      _id: newId(),
      name: h.name,
      code,
      description: "Mirrored from TalentOS.",
      hrmsDepartmentId: h._id,
      active: true,
      ...createStamp(null),
    });
  }
}

export interface Taxonomy {
  departments: SopDepartment[];
  functions: SopFunction[];
  processes: SopProcess[];
  categories: SopCategory[];
}

/** Request-scoped so a page + its child components share one read. */
export const getTaxonomy = cache(async (): Promise<Taxonomy> => {
  await ensureSopSeeded();
  await syncFromHrms();
  const c = await cols();
  const [departments, functions, processes, categories] = await Promise.all([
    c.departments.find(notDeleted).sort({ name: 1 }).toArray(),
    c.functions.find(notDeleted).sort({ name: 1 }).toArray(),
    c.processes.find(notDeleted).sort({ name: 1 }).toArray(),
    c.categories.find(notDeleted).sort({ name: 1 }).toArray(),
  ]);
  return { departments, functions, processes, categories };
});

// ---------------------------------------------------------------------------
// Mutations (callers enforce MANAGE_TEMPLATES and write the audit entry)
// ---------------------------------------------------------------------------

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function createDepartment(
  data: { name: string; code?: string; description?: string; hrmsDepartmentId?: string | null },
  actorId: string
): Promise<{ ok: true; doc: SopDepartment } | { ok: false; error: string }> {
  const c = await cols();
  const name = clean(data.name, 80);
  if (!name) return { ok: false, error: "Department name is required." };
  const all = await c.departments.find(notDeleted).toArray();
  if (all.some((d) => d.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: "A department with that name already exists." };
  const code = (clean(data.code, 8).toUpperCase().replace(/[^A-Z0-9]/g, "") || slugCode(name, new Set(all.map((d) => d.code))));
  if (all.some((d) => d.code === code)) return { ok: false, error: `Code ${code} is already used.` };
  if (data.hrmsDepartmentId && all.some((d) => d.hrmsDepartmentId === data.hrmsDepartmentId)) return { ok: false, error: "That TalentOS department is already linked." };
  const doc: SopDepartment = {
    _id: newId(),
    name,
    code,
    description: clean(data.description, 400),
    hrmsDepartmentId: data.hrmsDepartmentId || null,
    active: true,
    ...createStamp(actorId),
  };
  await c.departments.insertOne(doc);
  return { ok: true, doc };
}

export async function updateDepartment(
  id: string,
  data: { name?: string; description?: string; hrmsDepartmentId?: string | null; active?: boolean },
  actorId: string
): Promise<{ ok: true; doc: SopDepartment } | { ok: false; error: string }> {
  const c = await cols();
  const current = await c.departments.findOne({ _id: id, ...notDeleted });
  if (!current) return { ok: false, error: "Department not found." };
  const set: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const name = clean(data.name, 80);
    if (!name) return { ok: false, error: "Department name is required." };
    const dup = await c.departments.findOne({ _id: { $ne: id }, name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), ...notDeleted });
    if (dup) return { ok: false, error: "A department with that name already exists." };
    set.name = name;
  }
  if (data.description !== undefined) set.description = clean(data.description, 400);
  if (data.active !== undefined) set.active = !!data.active;
  if (data.hrmsDepartmentId !== undefined) {
    if (data.hrmsDepartmentId) {
      const taken = await c.departments.findOne({ _id: { $ne: id }, hrmsDepartmentId: data.hrmsDepartmentId, ...notDeleted });
      if (taken) return { ok: false, error: `Already linked to ${taken.name}.` };
    }
    set.hrmsDepartmentId = data.hrmsDepartmentId || null;
  }
  const doc = await c.departments.findOneAndUpdate({ _id: id }, { $set: { ...set, ...updateStamp(actorId) } }, { returnDocument: "after" });
  return doc ? { ok: true, doc } : { ok: false, error: "Department not found." };
}

async function usage(field: "departmentId" | "functionId" | "processId" | "categoryId", id: string): Promise<number> {
  const db = await getDb();
  const match = field === "processId" ? { $or: [{ processId: id }, { subProcessId: id }] } : { [field]: id };
  return db.collection(COLLECTIONS.sops).countDocuments({ ...match, deletedAt: null });
}

export async function deleteDepartment(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await cols();
  if ((await usage("departmentId", id)) > 0) return { ok: false, error: "SOPs belong to this department — deactivate it instead of deleting." };
  const fnCount = await c.functions.countDocuments({ departmentId: id, ...notDeleted });
  if (fnCount > 0) return { ok: false, error: "Remove its functions first, or deactivate the department." };
  const res = await c.departments.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

export async function upsertFunction(
  data: { id?: string; departmentId: string; name: string; description?: string; active?: boolean },
  actorId: string
): Promise<{ ok: true; doc: SopFunction } | { ok: false; error: string }> {
  const c = await cols();
  const name = clean(data.name, 100);
  if (!name) return { ok: false, error: "Function name is required." };
  const dept = await c.departments.findOne({ _id: data.departmentId, ...notDeleted });
  if (!dept) return { ok: false, error: "Department not found." };
  if (data.id) {
    const doc = await c.functions.findOneAndUpdate(
      { _id: data.id, ...notDeleted },
      { $set: { name, description: clean(data.description, 400), ...(data.active !== undefined ? { active: !!data.active } : {}), ...updateStamp(actorId) } },
      { returnDocument: "after" }
    );
    return doc ? { ok: true, doc } : { ok: false, error: "Function not found." };
  }
  const doc: SopFunction = { _id: newId(), departmentId: dept._id, name, description: clean(data.description, 400), active: true, ...createStamp(actorId) };
  await c.functions.insertOne(doc);
  return { ok: true, doc };
}

export async function deleteFunction(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await cols();
  if ((await usage("functionId", id)) > 0) return { ok: false, error: "SOPs use this function — deactivate it instead." };
  if ((await c.processes.countDocuments({ functionId: id, ...notDeleted })) > 0) return { ok: false, error: "Remove its processes first." };
  const res = await c.functions.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

export async function upsertProcess(
  data: { id?: string; functionId: string; parentId?: string | null; name: string; description?: string; active?: boolean },
  actorId: string
): Promise<{ ok: true; doc: SopProcess } | { ok: false; error: string }> {
  const c = await cols();
  const name = clean(data.name, 120);
  if (!name) return { ok: false, error: "Name is required." };
  const fn = await c.functions.findOne({ _id: data.functionId, ...notDeleted });
  if (!fn) return { ok: false, error: "Function not found." };
  let parentId: string | null = null;
  if (data.parentId) {
    const parent = await c.processes.findOne({ _id: data.parentId, functionId: fn._id, ...notDeleted });
    if (!parent) return { ok: false, error: "Parent process not found in this function." };
    if (parent.parentId) return { ok: false, error: "Sub-processes cannot be nested further." };
    parentId = parent._id;
  }
  if (data.id) {
    const doc = await c.processes.findOneAndUpdate(
      { _id: data.id, ...notDeleted },
      { $set: { name, description: clean(data.description, 400), ...(data.active !== undefined ? { active: !!data.active } : {}), ...updateStamp(actorId) } },
      { returnDocument: "after" }
    );
    return doc ? { ok: true, doc } : { ok: false, error: "Process not found." };
  }
  const doc: SopProcess = {
    _id: newId(),
    departmentId: fn.departmentId,
    functionId: fn._id,
    parentId,
    name,
    description: clean(data.description, 400),
    active: true,
    ...createStamp(actorId),
  };
  await c.processes.insertOne(doc);
  return { ok: true, doc };
}

export async function deleteProcess(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await cols();
  if ((await usage("processId", id)) > 0) return { ok: false, error: "SOPs use this process — deactivate it instead." };
  if ((await c.processes.countDocuments({ parentId: id, ...notDeleted })) > 0) return { ok: false, error: "Remove its sub-processes first." };
  const res = await c.processes.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function upsertCategory(
  data: { id?: string; name: string; color?: string; description?: string; active?: boolean },
  actorId: string
): Promise<{ ok: true; doc: SopCategory } | { ok: false; error: string }> {
  const c = await cols();
  const name = clean(data.name, 80);
  if (!name) return { ok: false, error: "Category name is required." };
  const color = data.color && COLOR_RE.test(data.color) ? data.color : "#3b82f6";
  const dup = await c.categories.findOne({
    ...(data.id ? { _id: { $ne: data.id } } : {}),
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    ...notDeleted,
  });
  if (dup) return { ok: false, error: "A category with that name already exists." };
  if (data.id) {
    const doc = await c.categories.findOneAndUpdate(
      { _id: data.id, ...notDeleted },
      { $set: { name, color, description: clean(data.description, 400), ...(data.active !== undefined ? { active: !!data.active } : {}), ...updateStamp(actorId) } },
      { returnDocument: "after" }
    );
    return doc ? { ok: true, doc } : { ok: false, error: "Category not found." };
  }
  const doc: SopCategory = { _id: newId(), name, color, description: clean(data.description, 400), active: true, ...createStamp(actorId) };
  await c.categories.insertOne(doc);
  return { ok: true, doc };
}

export async function deleteCategory(id: string, actorId: string): Promise<{ ok: boolean; error?: string }> {
  const c = await cols();
  if ((await usage("categoryId", id)) > 0) return { ok: false, error: "SOPs use this category — deactivate it instead." };
  const res = await c.categories.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}
