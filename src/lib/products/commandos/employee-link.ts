import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { BillingLimitError } from "@/lib/platform/billing/enforce";
import { createEmployee, EMPLOYEES_COLLECTION, type Employee } from "@/lib/products/talentos/employees";
import { createDepartment, createDesignation, listDepartments, listDesignations } from "@/lib/products/talentos/departments";
import { toEmployeeStatus, statusOf } from "@/lib/security/account-status";
import type { EmploymentType } from "@/lib/products/talentos/employee-status";

/**
 * Every person with a login has an HR file in TalentOS (employee code, designation, department …), made when the account is created and kept
 * in step with it. The person completes the rest of their own profile there (phone, address, emergency contacts, documents).
 */

const USERS = "admin_users";

export interface HrFileInput {
  userId: ObjectId;
  email: string;
  name: string;
  /** The designation's title: it becomes (or reuses) the matching TalentOS designation. */
  designationTitle: string;
  /** The part of the business, used to find or create the department when none is chosen. */
  departmentName?: string | null;
  departmentId?: string | null;
  reportingManagerId?: string | null;
  employmentType?: EmploymentType | null;
  joiningDate?: string | null;
  phone?: string | null;
  actorId: string;
}

export function splitName(full: string, email: string): { firstName: string; lastName: string } {
  const parts = full.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length === 0) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim() || "New";
    const p = local.split(" ");
    return { firstName: p[0].charAt(0).toUpperCase() + p[0].slice(1), lastName: p.slice(1).join(" ") };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const codeFor = (name: string) => name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");

/** The department to put someone in: the chosen one, else one by this name (created when the company has none like it). */
async function departmentFor(id: string | null | undefined, name: string | null | undefined, actorId: string): Promise<string> {
  const all = await listDepartments();
  if (id && all.some((d) => d._id === id)) return id;
  const want = (name || "Management").trim();
  const hit = all.find((d) => d.name.toLowerCase() === want.toLowerCase());
  if (hit) return hit._id;
  let code = codeFor(want);
  const taken = new Set(all.map((d) => d.code));
  for (let n = 2; taken.has(code); n++) code = `${codeFor(want).slice(0, 2)}${n}`;
  return (await createDepartment({ name: want, code }, actorId))._id;
}

/** The TalentOS designation with this title (any department), or a new one in the department. */
async function designationFor(title: string, departmentId: string, actorId: string): Promise<string> {
  const all = await listDesignations();
  const hit = all.find((d) => d.title.toLowerCase() === title.trim().toLowerCase() && d.departmentId === departmentId) ?? all.find((d) => d.title.toLowerCase() === title.trim().toLowerCase());
  if (hit) return hit._id;
  return (await createDesignation({ title: title.trim(), departmentId }, actorId))._id;
}

export type HrFileResult = { ok: true; employeeId: string; created: boolean } | { ok: false; error: string };

/** Finds the person's HR file or makes it, links it both ways, and returns its id. Never throws: a login must not fail because HR could not be written. */
export async function ensureHrFile(input: HrFileInput): Promise<HrFileResult> {
  try {
    const db = await getDb();
    const col = db.collection<Employee>(EMPLOYEES_COLLECTION);
    const email = input.email.trim().toLowerCase();
    const user = await db.collection(USERS).findOne({ _id: input.userId } as never, { projection: { status: 1, roles: 1, employeeId: 1, platformRoleId: 1 } });
    const existing = await col.findOne({ deletedAt: null, $or: [{ adminUserId: String(input.userId) }, { adminUserId: email }, { workEmail: email }, ...(user?.employeeId ? [{ _id: user.employeeId as string }] : [])] } as never);
    const deptId = await departmentFor(input.departmentId, input.departmentName, input.actorId);
    const designationId = await designationFor(input.designationTitle, deptId, input.actorId);

    let employee: Employee | null = existing;
    let created = false;
    if (!employee) {
      const { firstName, lastName } = splitName(input.name, email);
      const status = toEmployeeStatus(statusOf({ status: (user?.status as string | undefined) ?? undefined, roles: (user?.roles as string[] | undefined) ?? ["x"], platformRoleId: user?.platformRoleId as string | undefined }));
      employee = await createEmployee(
        {
          firstName,
          lastName,
          workEmail: email,
          status: status === "probation" ? "active" : status,
          personal: { dateOfBirth: null, gender: null, maritalStatus: null, personalEmail: null, phone: input.phone ?? null, addressLine: null, city: null, state: null, postalCode: null, photoKey: null },
          professional: {
            departmentId: deptId,
            designationId,
            teamId: null,
            reportingManagerId: input.reportingManagerId ?? null,
            employmentType: input.employmentType ?? "full_time",
            workLocation: null,
            joiningDate: input.joiningDate || new Date().toISOString().slice(0, 10),
            probationEndDate: null,
            relievingDate: null,
          },
          emergencyContacts: [],
        },
        input.actorId,
      );
      created = true;
    } else if (employee.professional.designationId !== designationId) {
      await col.updateOne({ _id: employee._id } as never, { $set: { "professional.designationId": designationId, "professional.departmentId": employee.professional.departmentId ?? deptId, updatedAt: new Date(), updatedBy: input.actorId } });
    }
    await col.updateOne({ _id: employee._id } as never, { $set: { adminUserId: String(input.userId) } });
    await db.collection(USERS).updateOne({ _id: input.userId } as never, { $set: { employeeId: employee._id } });
    return { ok: true, employeeId: employee._id, created };
  } catch (err) {
    if (err instanceof BillingLimitError) return { ok: false, error: err.message };
    console.error("[employee-link] could not make the HR file", err);
    return { ok: false, error: "The HR file could not be created." };
  }
}

/** The person's designation changed: the TalentOS record shows the same designation. */
export async function syncHrDesignation(userId: ObjectId, designationTitle: string, actorId: string): Promise<void> {
  try {
    const db = await getDb();
    const user = await db.collection(USERS).findOne({ _id: userId } as never, { projection: { email: 1, name: 1, employeeId: 1 } });
    if (!user?.employeeId) return;
    const emp = await db.collection<Employee>(EMPLOYEES_COLLECTION).findOne({ _id: user.employeeId as string, deletedAt: null } as never);
    if (!emp) return;
    const deptId = emp.professional.departmentId ?? (await departmentFor(null, null, actorId));
    const designationId = await designationFor(designationTitle, deptId, actorId);
    await db.collection(EMPLOYEES_COLLECTION).updateOne({ _id: emp._id } as never, { $set: { "professional.designationId": designationId, updatedAt: new Date(), updatedBy: actorId } });
  } catch (err) {
    console.error("[employee-link] could not update the HR designation", err);
  }
}
