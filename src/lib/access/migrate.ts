import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { accessToLegacy, legacyToAccess } from "./adapter";
import type { AccessMap } from "./types";

/**
 * Legacy -> access-map migration for the CURRENT company (wrap in runAsCompany). Additive and reversible:
 *
 *   dry-run  (default)  reads only; reports each person's feature counts and whether the round trip is exact
 *   apply               writes `access` and `accessMigration: { id, at, source: "migrated" }` on people who have no `access` yet
 *   revert              removes `access` / `accessMigration` from the rows migration `id` wrote
 *
 * roles, permissionOverrides, manualRoles, customRoleIds and savedRoles are never changed: the legacy data
 * stays in place until the owner confirms (decision D2).
 */

export interface PersonReport { id: string; email: string; director: boolean; features: { read: number; write: number }; products: number; exact: boolean; conflicts: string[]; action: "migrate" | "skip-has-access" }
export interface AccessMigrationReport { mode: "dry-run" | "apply" | "revert"; id: string; people: PersonReport[]; migrated: number; skipped: number; inexact: number; reverted?: number }

interface Row { _id: ObjectId; email?: string; roles?: string[]; permissionOverrides?: Record<string, boolean> | null; access?: AccessMap | null; accessMigration?: { id: string } | null }

export async function runAccessMigration(mode: AccessMigrationReport["mode"], id: string): Promise<AccessMigrationReport> {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) throw new Error("Migration id must be 4-40 letters, digits, - or _.");
  const col = (await getDb()).collection<Row>("admin_users");
  const report: AccessMigrationReport = { mode, id, people: [], migrated: 0, skipped: 0, inexact: 0 };
  if (mode === "revert") {
    const r = await col.updateMany({ "accessMigration.id": id } as never, { $unset: { access: "", accessMigration: "" } } as never);
    report.reverted = r.modifiedCount;
    return report;
  }
  for (const row of await col.find({}).toArray()) {
    const roles = row.roles ?? [];
    const { isDirector, access } = legacyToAccess({ roles, permissionOverrides: row.permissionOverrides ?? null });
    const back = isDirector ? { conflicts: [] as { key: string }[] } : accessToLegacy(access);
    const all = Object.values(access).flatMap((m) => Object.values(m));
    const p: PersonReport = {
      id: String(row._id), email: row.email ?? "", director: isDirector,
      features: { read: all.filter((l) => l === "read").length, write: all.filter((l) => l === "write").length },
      products: Object.keys(access).length, exact: back.conflicts.length === 0, conflicts: back.conflicts.map((c) => c.key),
      action: row.access ? "skip-has-access" : "migrate",
    };
    report.people.push(p);
    if (p.action === "skip-has-access") { report.skipped++; continue; }
    if (!p.exact) report.inexact++;
    if (mode === "apply") {
      await col.updateOne({ _id: row._id, access: { $exists: false } } as never, { $set: { access, accessMigration: { id, at: new Date(), source: "migrated" } } } as never);
    }
    report.migrated++;
  }
  return report;
}
