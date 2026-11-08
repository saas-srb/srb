import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId, todayIso, addDaysIso, cleanIsoDate } from "@/lib/products/playbook-ai/db";
import { hasSopAccess } from "@/lib/sop-roles";
import { canAcknowledgeSop, canAssignSop, toAccessDoc } from "@/lib/products/playbook-ai/access";
import { checklistItemIds } from "@/lib/products/playbook-ai/content";
import { recordAudit, recordAuditThrottled } from "@/lib/products/playbook-ai/audit";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { getSettings } from "@/lib/products/playbook-ai/settings";
import { getEmployeeContextForUser, listAssignablePeople, userNames } from "@/lib/products/playbook-ai/people";
import { notifySopUsers } from "@/lib/products/playbook-ai/notifications";
import type { AssignmentDoc, AssignmentSource, AssignmentState, SopDoc, SopViewer } from "@/lib/products/playbook-ai/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

let indexesEnsured = false;
async function col() {
  const db = await getDb();
  const c = db.collection<AssignmentDoc>(COLLECTIONS.assignments);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ sopId: 1, userId: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ userId: 1, acknowledgedAt: 1 }).catch(() => {}),
      c.createIndex({ departmentId: 1 }).catch(() => {}),
      c.createIndex({ dueDate: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

export function assignmentState(a: Pick<AssignmentDoc, "acknowledgedAt" | "dueDate">, today: string): AssignmentState {
  if (a.acknowledgedAt) return "acknowledged";
  return a.dueDate && a.dueDate < today ? "overdue" : "pending";
}

/** Ticked / total checklist items for the SOP's LIVE body (ids that no longer exist don't count). */
export function checklistProgress(live: Pick<SopDoc, "live">["live"], checklist: Record<string, boolean>): { done: number; total: number } {
  if (!live) return { done: 0, total: 0 };
  const ids = checklistItemIds(live);
  return { done: ids.filter((id) => checklist[id]).length, total: ids.length };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listAssignmentsForUser(userId: string): Promise<AssignmentDoc[]> {
  return (await col()).find({ userId }).sort({ assignedAt: -1 }).toArray();
}

export async function getAssignment(sopId: string, userId: string): Promise<AssignmentDoc | null> {
  return (await col()).findOne({ sopId, userId });
}

export async function countAssignments(sopId: string): Promise<number> {
  return (await col()).countDocuments({ sopId });
}

export async function listAssignmentsForSop(sopId: string): Promise<AssignmentDoc[]> {
  return (await col()).find({ sopId }).sort({ userName: 1 }).toArray();
}

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------

export type AssignTargetType = "user" | "team" | "department" | "role";

interface Assignee {
  userId: string;
  name: string;
  employeeId: string | null;
  departmentId: string | null;
}

/** Keeps only accounts that can actually open the SOP product (an assignment to someone with no access would be unreachable). */
async function filterSopUsers(userIds: string[]): Promise<Set<string>> {
  const valid = userIds.filter((i) => ObjectId.isValid(i));
  if (valid.length === 0) return new Set();
  const db = await getDb();
  const users = await db
    .collection<{ _id: ObjectId; roles?: string[] }>("admin_users")
    .find({ _id: { $in: valid.map((i) => new ObjectId(i)) } }, { projection: { roles: 1 } })
    .toArray();
  return new Set(users.filter((u) => hasSopAccess(u.roles)).map((u) => u._id.toString()));
}

async function resolveAssignees(
  v: SopViewer,
  type: AssignTargetType,
  ids: string[]
): Promise<{ assignees: Assignee[]; withoutLogin: number; noAccess: number; label: string }> {
  const tax = await getTaxonomy();
  const deptByHrms = new Map(tax.departments.filter((d) => d.hrmsDepartmentId).map((d) => [d.hrmsDepartmentId as string, d._id]));
  const deptIdOf = (hrmsId: string | null) => (hrmsId ? deptByHrms.get(hrmsId) ?? null : null);

  let raw: Assignee[] = [];
  let withoutLogin = 0;
  let label = "";

  if (type === "user") {
    const clean = ids.filter((i) => ObjectId.isValid(i)).slice(0, 500);
    const names = await userNames(clean);
    const db = await getDb();
    const users = clean.length
      ? await db
          .collection<{ _id: ObjectId; email: string; employeeId?: string | null }>("admin_users")
          .find({ _id: { $in: clean.map((i) => new ObjectId(i)) } }, { projection: { email: 1, employeeId: 1 } })
          .toArray()
      : [];
    for (const u of users) {
      const emp = await getEmployeeContextForUser({ id: u._id.toString(), email: u.email, employeeId: u.employeeId });
      raw.push({ userId: u._id.toString(), name: names.get(u._id.toString()) ?? u.email, employeeId: emp?.employeeId ?? null, departmentId: deptIdOf(emp?.hrmsDepartmentId ?? null) });
    }
    label = raw.length === 1 ? raw[0].name : `${raw.length} employees`;
  } else {
    const filter =
      type === "team"
        ? { teamIds: ids }
        : type === "role"
          ? { designationIds: ids }
          : { hrmsDepartmentIds: tax.departments.filter((d) => ids.includes(d._id) && d.hrmsDepartmentId).map((d) => d.hrmsDepartmentId as string) };
    const res = await listAssignablePeople(filter);
    withoutLogin = res.withoutLogin;
    raw = res.people.map((p) => ({ userId: p.userId, name: p.name, employeeId: p.employeeId, departmentId: deptIdOf(p.hrmsDepartmentId) }));
    const noun = type === "team" ? "team" : type === "role" ? "role" : "department";
    label = `${ids.length} ${noun}${ids.length === 1 ? "" : "s"}`;
  }

  const allowed = await filterSopUsers(raw.map((r) => r.userId));
  const assignees = raw.filter((r) => allowed.has(r.userId));
  return { assignees, withoutLogin, noAccess: raw.length - assignees.length, label };
}

async function upsertAssignments(
  sop: SopDoc,
  assignees: Assignee[],
  source: AssignmentSource,
  dueDate: string | null,
  by: { id: string; name: string }
): Promise<{ created: string[]; existing: number }> {
  const c = await col();
  const existingRows = await c.find({ sopId: sop._id, userId: { $in: assignees.map((a) => a.userId) } }, { projection: { userId: 1 } }).toArray();
  const have = new Set(existingRows.map((r) => r.userId));
  const now = new Date();
  const fresh = assignees.filter((a) => !have.has(a.userId));
  if (fresh.length) {
    try {
      await c.insertMany(
        fresh.map<AssignmentDoc>((a) => ({
          _id: newId(),
          sopId: sop._id,
          sopCode: sop.code,
          userId: a.userId,
          employeeId: a.employeeId,
          userName: a.name,
          departmentId: a.departmentId,
          source,
          dueDate,
          assignedBy: by.id,
          assignedByName: by.name,
          assignedAt: now,
          viewedAt: null,
          acknowledgedAt: null,
          acknowledgedVersion: null,
          requiredVersion: sop.version,
          ackHistory: [],
          checklist: {},
          checklistUpdatedAt: null,
          lastReminderAt: null,
        })),
        { ordered: false }
      );
    } catch {
      // a concurrent assign created some rows first — the unique (sop,user) index keeps this idempotent
    }
  }
  // Re-assigning someone who already has it only moves an open due date (never touches an acknowledgement).
  if (dueDate && have.size) {
    await c.updateMany({ sopId: sop._id, userId: { $in: Array.from(have) }, acknowledgedAt: null }, { $set: { dueDate } });
  }
  return { created: fresh.map((f) => f.userId), existing: have.size };
}

export async function assignSop(
  v: SopViewer,
  sop: SopDoc,
  input: { type: AssignTargetType; ids: string[]; dueDate?: string | null }
): Promise<Result<{ created: number; existing: number; withoutLogin: number; noAccess: number }>> {
  const today = todayIso();
  if (!canAssignSop(v, toAccessDoc(sop, today))) return { ok: false, error: "You can't assign this SOP (it must be published, and you need assign rights over it)." };
  const ids = Array.from(new Set(input.ids.filter((i) => typeof i === "string" && i.length > 0 && i.length <= 64))).slice(0, 500);
  if (ids.length === 0) return { ok: false, error: "Choose who to assign this SOP to." };

  const settings = await getSettings();
  const due = input.dueDate ? cleanIsoDate(input.dueDate) : addDaysIso(today, settings.defaultDueDays);
  if (input.dueDate && !due) return { ok: false, error: "Enter a valid due date." };
  if (due && due < today) return { ok: false, error: "The due date can't be in the past." };

  const { assignees, withoutLogin, noAccess, label } = await resolveAssignees(v, input.type, ids);
  if (assignees.length === 0) {
    const why = withoutLogin ? ` ${withoutLogin} matching employee(s) have no login account yet.` : "";
    return { ok: false, error: `No one to assign to.${why}` };
  }

  const source: AssignmentSource = { type: input.type, id: ids.length === 1 ? ids[0] : null, label };
  const { created, existing } = await upsertAssignments(sop, assignees, source, due, { id: v.userId, name: v.name });

  await recordAudit({
    actorId: v.userId,
    actorEmail: v.email,
    action: "assign",
    entity: "assignment",
    entityId: sop._id,
    sopId: sop._id,
    entityLabel: `${sop.code} · ${sop.title}`,
    summary: `Assigned to ${label}: ${created.length} new, ${existing} already assigned${due ? `, due ${due}` : ""}`,
    metadata: { type: input.type, ids, created: created.length, existing, withoutLogin, noAccess },
  });
  await notifySopUsers(created.filter((u) => u !== v.userId), {
    type: "sop_assigned",
    title: `SOP assigned: ${sop.title}`,
    body: `${v.name} assigned you ${sop.code} v${sop.version}${due ? ` — please acknowledge by ${due}` : ""}.`,
    link: `/playbook-ai/library/${sop._id}`,
    dedupeKey: `sop-assigned:${sop._id}:${sop.version}`,
  });
  return { ok: true, created: created.length, existing, withoutLogin, noAccess };
}

export async function unassignSop(v: SopViewer, sop: SopDoc, userId: string): Promise<Result> {
  if (!canAssignSop(v, toAccessDoc(sop, todayIso()))) return { ok: false, error: "You can't change assignments on this SOP." };
  const c = await col();
  const row = await c.findOneAndDelete({ sopId: sop._id, userId });
  if (!row) return { ok: false, error: "That assignment no longer exists." };
  await recordAudit({
    actorId: v.userId,
    actorEmail: v.email,
    action: "assign",
    entity: "assignment",
    entityId: sop._id,
    sopId: sop._id,
    entityLabel: `${sop.code} · ${sop.title}`,
    summary: `Removed assignment for ${row.userName}`,
  });
  return { ok: true };
}

/** Publishing a mandatory SOP assigns it to every member of its department (filtered by applicable roles). Idempotent — safe to re-run on every publish so new joiners are picked up. */
export async function autoAssignMandatory(sop: SopDoc, by: SopViewer): Promise<void> {
  const tax = await getTaxonomy();
  const dept = tax.departments.find((d) => d._id === sop.departmentId);
  if (!dept?.hrmsDepartmentId) return;
  const res = await listAssignablePeople({
    hrmsDepartmentIds: [dept.hrmsDepartmentId],
    ...(sop.applicableRoleIds.length ? { designationIds: sop.applicableRoleIds } : {}),
  });
  const allowed = await filterSopUsers(res.people.map((p) => p.userId));
  const assignees: Assignee[] = res.people
    .filter((p) => allowed.has(p.userId))
    .map((p) => ({ userId: p.userId, name: p.name, employeeId: p.employeeId, departmentId: dept._id }));
  if (assignees.length === 0) return;
  const settings = await getSettings();
  const { created } = await upsertAssignments(sop, assignees, { type: "mandatory", id: dept._id, label: `Mandatory for ${dept.name}` }, addDaysIso(todayIso(), settings.defaultDueDays), { id: by.userId, name: by.name });
  if (created.length) {
    await recordAudit({
      actorId: by.userId,
      actorEmail: by.email,
      action: "assign",
      entity: "assignment",
      entityId: sop._id,
      sopId: sop._id,
      entityLabel: `${sop.code} · ${sop.title}`,
      summary: `Mandatory SOP auto-assigned to ${created.length} member(s) of ${dept.name}`,
    });
    await notifySopUsers(created, {
      type: "sop_assigned",
      title: `Mandatory SOP: ${sop.title}`,
      body: `${sop.code} v${sop.version} is mandatory for ${dept.name}. Please read and acknowledge it.`,
      link: `/playbook-ai/library/${sop._id}`,
      dedupeKey: `sop-assigned:${sop._id}:${sop.version}`,
    });
  }
}

/** Called after a NEW version goes live: optionally re-opens acknowledgements and tells everyone assigned. */
export async function onNewVersionPublished(
  sop: SopDoc,
  version: string,
  changeSummary: string,
  opts: { requireReack: boolean; dueDate: string },
  by: SopViewer
): Promise<void> {
  const c = await col();
  await c.updateMany({ sopId: sop._id }, { $set: { requiredVersion: version } });
  if (opts.requireReack) {
    await c.updateMany({ sopId: sop._id, acknowledgedAt: { $ne: null } }, { $set: { acknowledgedAt: null, acknowledgedVersion: null, dueDate: opts.dueDate, lastReminderAt: null } });
  }
  if (sop.mandatory) await autoAssignMandatory(sop, by);

  const rows = await c.find({ sopId: sop._id }, { projection: { userId: 1 } }).toArray();
  await notifySopUsers(
    rows.map((r) => r.userId).filter((u) => u !== by.userId),
    {
      type: "sop_updated",
      title: `${sop.code} updated to v${version}`,
      body: `${sop.title}: ${changeSummary}${opts.requireReack ? " — re-acknowledgement required." : ""}`,
      link: `/playbook-ai/library/${sop._id}`,
      dedupeKey: `sop-updated:${sop._id}:${version}`,
    }
  );
}

// ---------------------------------------------------------------------------
// Employee actions: view / acknowledge / checklist
// ---------------------------------------------------------------------------

/** Marks the viewer's assignment as viewed (first time only) and logs a throttled audit "view". */
export async function recordView(v: SopViewer, sop: SopDoc): Promise<void> {
  const c = await col();
  await c.updateOne({ sopId: sop._id, userId: v.userId, viewedAt: null }, { $set: { viewedAt: new Date() } });
  await recordAuditThrottled({
    actorId: v.userId,
    actorEmail: v.email,
    action: "view",
    entity: "sop",
    entityId: sop._id,
    entityLabel: `${sop.code} · ${sop.title}`,
    summary: `Viewed v${sop.version ?? "draft"}`,
  });
}

async function ensureAssignmentRow(v: SopViewer, sop: SopDoc): Promise<AssignmentDoc> {
  const c = await col();
  const existing = await c.findOne({ sopId: sop._id, userId: v.userId });
  if (existing) return existing;
  const doc: AssignmentDoc = {
    _id: newId(),
    sopId: sop._id,
    sopCode: sop.code,
    userId: v.userId,
    employeeId: v.employeeId,
    userName: v.name,
    departmentId: v.memberDepartmentIds[0] ?? null,
    source: { type: "self", id: null, label: "Self-acknowledged" },
    dueDate: null,
    assignedBy: v.userId,
    assignedByName: v.name,
    assignedAt: new Date(),
    viewedAt: new Date(),
    acknowledgedAt: null,
    acknowledgedVersion: null,
    requiredVersion: sop.version,
    ackHistory: [],
    checklist: {},
    checklistUpdatedAt: null,
    lastReminderAt: null,
  };
  try {
    await c.insertOne(doc);
    return doc;
  } catch {
    return (await c.findOne({ sopId: sop._id, userId: v.userId })) ?? doc; // lost a race to a concurrent insert
  }
}

export async function acknowledgeSop(v: SopViewer, sop: SopDoc, version: string, assigned: boolean): Promise<Result<{ version: string }>> {
  if (!sop.version || !sop.live) return { ok: false, error: "This SOP has no published version to acknowledge yet." };
  if (!canAcknowledgeSop(v, toAccessDoc(sop, todayIso()), assigned)) return { ok: false, error: "You can't acknowledge this SOP." };
  if (version !== sop.version) return { ok: false, error: `A newer version (v${sop.version}) was published. Read it, then acknowledge.` };

  const row = await ensureAssignmentRow(v, sop);
  if (row.acknowledgedAt && row.acknowledgedVersion === sop.version) return { ok: true, version: sop.version };

  const c = await col();
  const now = new Date();
  await c.updateOne(
    { _id: row._id },
    {
      $set: { acknowledgedAt: now, acknowledgedVersion: sop.version, requiredVersion: sop.version, viewedAt: row.viewedAt ?? now },
      $push: { ackHistory: { version: sop.version, at: now } },
    }
  );
  await recordAudit({
    actorId: v.userId,
    actorEmail: v.email,
    action: "acknowledge",
    entity: "assignment",
    entityId: sop._id,
    sopId: sop._id,
    entityLabel: `${sop.code} · ${sop.title}`,
    summary: `Acknowledged v${sop.version}`,
  });
  return { ok: true, version: sop.version };
}

export async function setChecklistItem(
  v: SopViewer,
  sop: SopDoc,
  itemKey: string,
  done: boolean,
  assigned: boolean
): Promise<Result<{ done: number; total: number }>> {
  if (!sop.live) return { ok: false, error: "This SOP has no published version." };
  if (!canAcknowledgeSop(v, toAccessDoc(sop, todayIso()), assigned)) return { ok: false, error: "You can't update this checklist." };
  if (!checklistItemIds(sop.live).includes(itemKey)) return { ok: false, error: "That checklist item no longer exists." };
  const row = await ensureAssignmentRow(v, sop);
  const c = await col();
  const res = await c.findOneAndUpdate(
    { _id: row._id },
    { $set: { [`checklist.${itemKey}`]: !!done, checklistUpdatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!res) return { ok: false, error: "Assignment not found." };
  return { ok: true, ...checklistProgress(sop.live, res.checklist) };
}

/** Manager-triggered nudge to everyone who still has to acknowledge (skips anyone reminded in the last 24h). */
export async function remindPending(v: SopViewer, sop: SopDoc): Promise<Result<{ reminded: number }>> {
  if (!canAssignSop(v, toAccessDoc(sop, todayIso()))) return { ok: false, error: "You can't send reminders for this SOP." };
  const c = await col();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await c.find({ sopId: sop._id, acknowledgedAt: null, $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: cutoff } }] }).toArray();
  if (rows.length === 0) return { ok: true, reminded: 0 };
  const today = todayIso();
  await notifySopUsers(rows.map((r) => r.userId), {
    type: "sop_reminder",
    title: `Reminder: acknowledge ${sop.code}`,
    body: `${v.name} asked you to read and acknowledge "${sop.title}".`,
    link: `/playbook-ai/library/${sop._id}`,
    dedupeKey: `sop-manual-remind:${sop._id}:${today}`,
  });
  await c.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { lastReminderAt: new Date() } });
  await recordAudit({
    actorId: v.userId,
    actorEmail: v.email,
    action: "reminder",
    entity: "assignment",
    entityId: sop._id,
    sopId: sop._id,
    entityLabel: `${sop.code} · ${sop.title}`,
    summary: `Sent acknowledgement reminders to ${rows.length} people`,
  });
  return { ok: true, reminded: rows.length };
}
