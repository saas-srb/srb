import "server-only";
import { cache } from "react";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { listDepartments, listDesignations } from "@/lib/platform/organization";
import { displayTitle, type DisplayTitle, type TitleLookups } from "@/lib/platform/organization/title";

export * from "@/lib/platform/organization/title";

const lookups = cache(async (): Promise<TitleLookups> => {
  const [designations, departments] = await Promise.all([listDesignations({ includeArchived: true }), listDepartments({ includeArchived: true })]);
  return { designations: new Map(designations.map((d) => [d._id, { title: d.title, departmentId: d.departmentId }])), departments: new Map(departments.map((d) => [d._id, d.name])) };
});

/** The title of one person (by account id), from the central organization service. Never throws: a failure gives "Team member". */
export async function titleOfPerson(userId: string): Promise<DisplayTitle> {
  try {
    const u = ObjectId.isValid(userId) ? await (await getDb()).collection<{ designationId?: string | null; designationIds?: string[] }>("admin_users").findOne({ _id: new ObjectId(userId) } as never, { projection: { designationId: 1, designationIds: 1 } }) : null;
    return displayTitle(u, await lookups());
  } catch {
    return displayTitle(null, { designations: new Map(), departments: new Map() });
  }
}

/** Titles for many people at once (directory, comments, approvals): one organization read for the whole list. */
export async function titlesOfPeople(userIds: string[]): Promise<Map<string, DisplayTitle>> {
  const ids = [...new Set(userIds.filter((i) => ObjectId.isValid(i)))];
  const out = new Map<string, DisplayTitle>();
  const l = await lookups();
  const rows = ids.length ? await (await getDb()).collection<{ _id: ObjectId; designationId?: string | null; designationIds?: string[] }>("admin_users").find({ _id: { $in: ids.map((i) => new ObjectId(i)) } } as never, { projection: { designationId: 1, designationIds: 1 } }).toArray() : [];
  for (const r of rows) out.set(String(r._id), displayTitle(r, l));
  for (const i of userIds) if (!out.has(i)) out.set(i, displayTitle(null, l));
  return out;
}

/**
 * Titles for HR employees by employee id (leave requests, payroll, directory): the title of the linked sign-in account when there is one, otherwise the
 * designation on the employee record. Same words everywhere; no designation gives "Team member".
 */
export async function titlesOfEmployees(employeeIds: string[]): Promise<Map<string, DisplayTitle>> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  const out = new Map<string, DisplayTitle>();
  const l = await lookups();
  const db = await getDb();
  const rows = ids.length ? await db.collection<{ _id: string; adminUserId?: string | null; professional?: { designationId?: string | null } }>("hrms_employees").find({ _id: { $in: ids } } as never, { projection: { adminUserId: 1, "professional.designationId": 1 } }).toArray() : [];
  const accountTitles = await titlesOfPeople(rows.map((r) => r.adminUserId).filter((x): x is string => !!x));
  for (const r of rows) {
    const linked = r.adminUserId ? accountTitles.get(r.adminUserId) : undefined;
    out.set(String(r._id), linked && linked.title !== "Team member" ? linked : displayTitle({ designationId: r.professional?.designationId ?? null }, l));
  }
  for (const i of ids) if (!out.has(i)) out.set(i, displayTitle(null, l));
  return out;
}
