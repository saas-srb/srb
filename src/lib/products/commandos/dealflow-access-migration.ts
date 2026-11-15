import "server-only";
import { getDb } from "@/lib/mongodb";
import { legacyToAccess } from "@/lib/access/adapter";
import { hasLmsAccess } from "@/lib/lms-roles";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";

/**
 * DealFlow's product tile used to be open to any account. It now follows the access matrix like every other product, so everybody who could
 * open it before is given the lowest DealFlow level (`lms_agent`) once. Additive and reversible: `dry-run` (default) reports, `apply` adds the
 * role and stamps the row with the migration id, `revert` removes exactly what that id added. Recomputes the saved access map when there is one.
 */
export interface DealflowMigrationReport { mode: "dry-run" | "apply" | "revert"; id: string; candidates: string[]; changed: number }

export async function runDealflowAccessMigration(mode: DealflowMigrationReport["mode"], id: string): Promise<DealflowMigrationReport> {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) throw new Error("Migration id must be 4-40 letters, digits, - or _.");
  const col = (await getDb()).collection<{ _id: unknown; email: string; roles?: string[]; manualRoles?: string[]; permissionOverrides?: Record<string, boolean>; access?: unknown; status?: string; _dealflowMigration?: { id: string } }>("admin_users");
  const report: DealflowMigrationReport = { mode, id, candidates: [], changed: 0 };
  const recompute = async (row: { _id: unknown; roles: string[]; permissionOverrides?: Record<string, boolean>; access?: unknown }) => {
    if (row.access) await col.updateOne({ _id: row._id as never }, { $set: { access: legacyToAccess({ roles: row.roles, permissionOverrides: row.permissionOverrides ?? null }).access } as never });
  };
  if (mode === "revert") {
    for (const u of await col.find({ "_dealflowMigration.id": id } as never).toArray()) {
      const roles = (u.roles ?? []).filter((r) => r !== "lms_agent");
      const manual = (u.manualRoles ?? []).filter((r) => r !== "lms_agent");
      await col.updateOne({ _id: u._id as never }, { $set: { roles, ...(u.manualRoles ? { manualRoles: manual } : {}) }, $unset: { _dealflowMigration: "" } } as never);
      await recompute({ _id: u._id, roles, permissionOverrides: u.permissionOverrides, access: u.access });
      report.changed++;
    }
    return report;
  }
  for (const u of await col.find({ status: { $nin: BLOCKED_STATUSES } } as never).toArray()) {
    const roles = u.roles ?? [];
    if (roles.length === 0 || roles.includes("super_admin") || hasLmsAccess(roles)) continue;
    report.candidates.push(u.email);
    if (mode === "apply") {
      const next = [...roles, "lms_agent"];
      await col.updateOne({ _id: u._id as never }, { $set: { roles: next, ...(u.manualRoles ? { manualRoles: [...u.manualRoles, "lms_agent"] } : {}), _dealflowMigration: { id } } } as never);
      await recompute({ _id: u._id, roles: next, permissionOverrides: u.permissionOverrides, access: u.access });
      report.changed++;
    }
  }
  return report;
}
