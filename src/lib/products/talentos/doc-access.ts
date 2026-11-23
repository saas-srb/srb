import "server-only";
import { hrCan } from "@/lib/talentos-access";
import { hrReach, reaches } from "@/lib/products/talentos/scope";
import type { CurrentHrmsUser } from "@/lib/hrms-auth";

type Person = Pick<CurrentHrmsUser, "roles" | "permissionOverrides" | "employeeId" | "subject">;

/**
 * Who may put a document on whose record. Only someone who manages employee documents uploads for other people, and only for employees they can reach
 * (their reporting line, or everyone); everybody else, a manager included, uploads to their own record only.
 * Returns the employee the document goes to, and whether it is a staff upload; or null when the upload is refused.
 */
export async function uploadTarget(user: Person, requestedEmployeeId: string): Promise<{ employeeId: string; role: "staff" | "employee" } | { error: "none" | "forbidden" }> {
  const manager = hrCan(user, "documents.manage");
  // Everybody may add to their own record if they hold documents.upload; other people's records need documents.manage and reach.
  if (!manager && !hrCan(user, "documents.upload")) return { error: "forbidden" };
  const target = manager ? requestedEmployeeId || user.employeeId || "" : user.employeeId ?? "";
  if (!target) return { error: "none" };
  if (target !== user.employeeId && !(manager && reaches(await hrReach(user, "employees"), target))) return { error: "forbidden" };
  return { employeeId: target, role: manager ? "staff" : "employee" };
}

/** May this person download this employee's document? Their own, or (staff only) one of an employee they can reach. */
export async function mayReadDocument(user: Person, documentEmployeeId: string): Promise<boolean> {
  if (user.employeeId && documentEmployeeId === user.employeeId) return hrCan(user, "documents.view");
  return (hrCan(user, "employees.team") || hrCan(user, "employees.all")) && reaches(await hrReach(user, "employees"), documentEmployeeId);
}

/** May this person download this employee's signed ContractFlow document? Their own, or HR (manages employees) for an employee they can reach. */
export async function maySeeSignedDocument(user: Person, employeeId: string): Promise<boolean> {
  return user.employeeId === employeeId || (hrCan(user, "employees.manage") && reaches(await hrReach(user, "employees"), employeeId));
}
