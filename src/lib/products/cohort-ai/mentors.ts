import "server-only";
import { getDb } from "@/lib/mongodb";
import { EMPLOYEES_COLLECTION, employeeFullName, type Employee } from "@/lib/products/talentos/employees";

/**
 * "Mentors" in TMS are not a dedicated collection — they are `hrms_employees`
 * records whose linked `admin_users` account carries the `mentor` TMS role.
 * A batch's `mentorId` is an `hrms_employees` `_id`.
 *
 * This resolver joins the two so batch forms / rosters / dashboards can show
 * mentor names without every call site re-deriving the link.
 */

export interface MentorOption {
  /** `hrms_employees._id` — what a batch stores as `mentorId`. */
  _id: string;
  name: string;
  employeeCode: string | null;
  email: string | null;
}

/** Every employee eligible to mentor (has a `mentor` TMS login). Sorted by name. */
export async function listMentorOptions(): Promise<MentorOption[]> {
  const db = await getDb();
  const employeeIds = (await db
    .collection("admin_users")
    .distinct("employeeId", { roles: "mentor", employeeId: { $ne: null } })) as unknown[];
  const ids = employeeIds.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (ids.length === 0) return [];

  const employees = await db
    .collection<Employee>(EMPLOYEES_COLLECTION)
    .find({ _id: { $in: ids }, deletedAt: null }, { projection: { firstName: 1, lastName: 1, employeeCode: 1, workEmail: 1 } })
    .toArray();

  return employees
    .map((e) => ({
      _id: e._id,
      name: employeeFullName(e),
      employeeCode: e.employeeCode ?? null,
      email: e.workEmail ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve a set of `mentorId`s to display names. Missing ids map to "Unassigned". */
export async function resolveMentorNames(mentorIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(mentorIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (ids.length === 0) return map;

  const db = await getDb();
  const employees = await db
    .collection<Employee>(EMPLOYEES_COLLECTION)
    .find({ _id: { $in: ids } }, { projection: { firstName: 1, lastName: 1 } })
    .toArray();
  for (const e of employees) map.set(e._id, employeeFullName(e));
  return map;
}

export async function getMentorName(mentorId: string | null | undefined): Promise<string | null> {
  if (!mentorId) return null;
  const map = await resolveMentorNames([mentorId]);
  return map.get(mentorId) ?? null;
}
