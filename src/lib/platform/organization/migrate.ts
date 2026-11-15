import "server-only";
import { getDb } from "@/lib/mongodb";
import { createDepartment, listDepartments, DEPARTMENTS_COLLECTION } from "./store";
import { planSopDepartments, planTextValues, TEXT_TARGETS, type PlanAction, type TextPlan } from "./migration-plan";

/**
 * Additive, reversible department unification for the CURRENT company (wrap in runAsCompany).
 *
 *   dry-run  (default)  reads only, returns the report
 *   apply               links/creates, stamping every touched row with `_orgMigration: { id, at }`
 *   revert              undoes exactly what migration `id` did (links removed, created departments archived
 *                       only when nothing uses them); original rows and text values are never altered
 */

export interface MigrationReport {
  mode: "dry-run" | "apply" | "revert";
  id: string;
  sop: { actions: PlanAction[]; linked: number; created: number; alreadyLinked: number; conflicts: number };
  text: { collection: string; plan: TextPlan; updated: number }[];
  reverted?: { unlinked: number; departmentsArchived: number; departmentsKept: string[]; textCleared: number };
}

export async function runDepartmentMigration(mode: MigrationReport["mode"], id: string): Promise<MigrationReport> {
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) throw new Error("Migration id must be 4-40 letters, digits, - or _.");
  const db = await getDb();
  const sopCol = db.collection<{ _id: string; name: string; code: string; hrmsDepartmentId: string | null; deletedAt: Date | null; _orgMigration?: { id: string; at: Date } }>("sop_departments");
  const stamp = { id, at: new Date() };
  const report: MigrationReport = { mode, id, sop: { actions: [], linked: 0, created: 0, alreadyLinked: 0, conflicts: 0 }, text: [] };

  if (mode === "revert") {
    const linked = await sopCol.updateMany({ "_orgMigration.id": id }, { $set: { hrmsDepartmentId: null }, $unset: { _orgMigration: "" } });
    const orgCol = db.collection<{ _id: string; name: string; deletedAt: Date | null; _orgMigration?: { id: string } }>(DEPARTMENTS_COLLECTION);
    const created = await orgCol.find({ "_orgMigration.id": id, deletedAt: null }).toArray();
    let archived = 0;
    const kept: string[] = [];
    for (const d of created) {
      const used = await db.collection("hrms_employees").countDocuments({ "professional.departmentId": d._id, deletedAt: null });
      if (used > 0) { kept.push(d.name); continue; }
      await orgCol.updateOne({ _id: d._id }, { $set: { deletedAt: new Date() } });
      archived++;
    }
    let textCleared = 0;
    for (const t of TEXT_TARGETS) {
      const r = await db.collection(t.collection).updateMany({ _orgMigration: { id } } as never, { $unset: { [t.idField]: "", _orgMigration: "" } } as never);
      textCleared += r.modifiedCount;
    }
    report.reverted = { unlinked: linked.modifiedCount, departmentsArchived: archived, departmentsKept: kept, textCleared };
    return report;
  }

  const org = await listDepartments();
  const sop = await sopCol.find({ deletedAt: null }).toArray();
  const actions = planSopDepartments(org.map((o) => ({ _id: o._id, name: o.name, code: o.code })), sop);
  report.sop.actions = actions;
  report.sop.alreadyLinked = actions.filter((a) => a.kind === "skip-linked").length;
  report.sop.linked = actions.filter((a) => a.kind === "link").length;
  report.sop.created = actions.filter((a) => a.kind === "create-and-link").length;
  report.sop.conflicts = actions.filter((a) => a.kind === "conflict").length;

  const createdByName = new Map<string, string>();
  if (mode === "apply") {
    const orgCol = db.collection<{ _id: string; _orgMigration?: unknown }>(DEPARTMENTS_COLLECTION);
    for (const a of actions) {
      if (a.kind === "link") {
        await sopCol.updateOne({ _id: a.sopId, hrmsDepartmentId: null }, { $set: { hrmsDepartmentId: a.orgId, _orgMigration: stamp } });
      } else if (a.kind === "create-and-link") {
        const key = a.name.trim().toLowerCase();
        let orgId = createdByName.get(key);
        if (!orgId) {
          const dep = await createDepartment({ name: a.name, code: a.code }, null);
          orgId = dep._id;
          createdByName.set(key, orgId);
          await orgCol.updateOne({ _id: orgId }, { $set: { _orgMigration: stamp } });
        }
        await sopCol.updateOne({ _id: a.sopId, hrmsDepartmentId: null }, { $set: { hrmsDepartmentId: orgId, _orgMigration: stamp } });
      }
    }
  }

  const orgNow = mode === "apply" ? await listDepartments() : org;
  for (const t of TEXT_TARGETS) {
    const col = db.collection(t.collection);
    const rows = await col.aggregate<{ _id: string; count: number }>([
      { $match: { [t.textField]: { $type: "string", $ne: "" }, [t.idField]: { $exists: false } } },
      { $group: { _id: `$${t.textField}`, count: { $sum: 1 } } },
    ]).toArray();
    const plan = planTextValues(orgNow.map((o) => ({ _id: o._id, name: o.name, code: o.code })), rows.map((r) => ({ text: r._id, count: r.count })));
    let updated = 0;
    if (mode === "apply") {
      for (const d of plan.distinct) {
        if (!d.orgId) continue;
        const r = await col.updateMany({ [t.textField]: d.text, [t.idField]: { $exists: false } } as never, { $set: { [t.idField]: d.orgId, _orgMigration: { id } } } as never);
        updated += r.modifiedCount;
      }
    }
    report.text.push({ collection: t.collection, plan, updated });
  }
  return report;
}
