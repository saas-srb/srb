import "server-only";
import { getDb } from "@/lib/mongodb";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { notDeleted } from "@/lib/products/sprintos/db";
import { hasPmsStaffRole, type PmsRole } from "@/lib/pms-roles";
import { PROJECTS_COLLECTION } from "@/lib/products/sprintos/projects";
import { MEMBERS_COLLECTION } from "@/lib/products/sprintos/project-members";

interface AccessUser {
  id: string;
  roles: PmsRole[];
  employeeId: string | null;
}

/**
 * Project-level authorisation. Staff (super_admin / pms_admin / pms_manager)
 * see everything. An employee-only user can only touch a project they manage
 * or are an active member of.
 *
 * Returns `{ member, canManage }` — `member` is false for staff (they aren't
 * necessarily on the team), `canManage` mirrors `canManageProjects`.
 */
export async function checkProjectAccess(
  user: AccessUser,
  projectId: string
): Promise<{ allowed: boolean; canManage: boolean }> {
  const staff = hasPmsStaffRole(user.roles);
  if (staff) return { allowed: true, canManage: true };
  if (!user.employeeId) return { allowed: false, canManage: false };

  const db = await getDb();
  const [project, membership] = await Promise.all([
    db.collection<{ _id: string; projectManagerId: string | null }>(PROJECTS_COLLECTION).findOne(
      { _id: projectId, ...notDeleted },
      { projection: { projectManagerId: 1 } }
    ),
    db
      .collection(MEMBERS_COLLECTION)
      .findOne({ projectId, employeeId: user.employeeId, active: true, ...notDeleted }, { projection: { _id: 1 } }),
  ]);
  if (!project) return { allowed: false, canManage: false };
  const allowed = project.projectManagerId === user.employeeId || membership !== null;
  return { allowed, canManage: false };
}

/** The employeeId to scope list queries by, or undefined for full-access staff. */
export function scopeEmployeeId(user: AccessUser): string | undefined {
  if (hasPmsStaffRole(user.roles)) return undefined;
  return user.employeeId ?? "__none__";
}

/**
 * Portal action guard. Returns the caller's own `employeeId` — portal actions
 * (timesheets, task updates on own tasks) must only ever touch this id.
 */
export async function requirePmsEmployee(): Promise<{ userId: string; employeeId: string; email: string; roles: PmsRole[] }> {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (user.mustChangePassword) throw new Error("Unauthorized");
  if (!user.employeeId) throw new Error("Forbidden");
  return { userId: user.id, employeeId: user.employeeId, email: user.email, roles: user.roles };
}
