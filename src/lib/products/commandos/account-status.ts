import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { revokeSessionsOf } from "@/lib/cross-module-sso";
import { recordAccessAudit } from "@/lib/products/commandos/custom-roles";
import { rolesUseSeat, seatBlockReason } from "@/lib/platform/billing/enforce";
import {
  BLOCKED_STATUSES,
  canSignIn,
  checkStatusChange,
  fromEmployeeStatus,
  isAccountStatus,
  statusMeta,
  statusOf,
  toEmployeeStatus,
  type AccountStatus,
} from "@/lib/security/account-status";

/**
 * Changing the status of a person's account (Users → the person → Status). One path for every change, from the Users screen or from the HR
 * file, so the rules and the effects are the same everywhere:
 *   - who may do it and what is refused (`checkStatusChange`: not yourself, only a Director touches a Director, the last Director stays)
 *   - a status that cannot sign in ends every sign-in of that person in every product, right now
 *   - coming back from a status that could not sign in takes a seat again (and is refused when the plan is full)
 *   - the HR file (TalentOS employee) gets the matching status, the last working day and, for people who left, a relieving date
 *   - the change, the reason and who made it are kept in the account's history and in the access audit log
 */

const USERS = "admin_users";
const EMPLOYEES = "hrms_employees";
export const STATUS_EVENTS_COLLECTION = "account_status_events";

interface UserDoc {
  _id: ObjectId;
  email: string;
  name?: string;
  roles?: string[];
  /** Roles kept aside by the old way of deactivating (emptying `roles`); restored when the account comes back. */
  savedRoles?: string[];
  status?: string;
  platformRoleId?: string | null;
  employeeId?: string | null;
}

export interface StatusEventRow {
  id: string;
  at: string;
  from: AccountStatus;
  to: AccountStatus;
  reason: string;
  lastWorkingDay: string | null;
  actorEmail: string | null;
  source: "users" | "hrms";
}

const todayIso = () => new Date().toISOString().slice(0, 10);

async function otherActiveDirectors(targetId: ObjectId): Promise<number> {
  const rows = await (await getDb()).collection<UserDoc>(USERS).find({ roles: "super_admin", _id: { $ne: targetId } }, { projection: { roles: 1, status: 1 } }).toArray();
  return rows.filter((r) => canSignIn(r)).length;
}

/** The employee record behind a login: the linked one, else the one that points back, else the one with the same work email. */
async function employeeFor(u: UserDoc): Promise<{ _id: string } | null> {
  const col = (await getDb()).collection<{ _id: string; adminUserId?: string | null; workEmail?: string; deletedAt?: Date | null }>(EMPLOYEES);
  const or: Record<string, unknown>[] = [{ adminUserId: String(u._id) }, { adminUserId: u.email }, { workEmail: u.email }];
  if (u.employeeId) or.unshift({ _id: u.employeeId });
  return col.findOne({ deletedAt: null, $or: or } as never, { projection: { _id: 1 } });
}

export interface ApplyMeta {
  actorId: string;
  reason?: string;
  lastWorkingDay?: string | null;
  /** `hrms` = the change started in the HR file, which already has the new status. */
  source: "users" | "hrms";
}

/** The write and all its effects. Callers have already checked that it is allowed. */
async function apply(user: UserDoc, to: AccountStatus, meta: ApplyMeta): Promise<void> {
  const db = await getDb();
  const from = statusOf(user);
  const now = new Date();
  const reason = (meta.reason ?? "").trim().slice(0, 500);
  const lastDay = meta.lastWorkingDay || null;
  const set: Record<string, unknown> = { status: to, statusChangedAt: now, statusChangedBy: meta.actorId, statusReason: reason, updatedAt: now };
  if (lastDay) set.lastWorkingDay = lastDay;
  const unset: Record<string, ""> = {};
  if (statusMeta(to).canSignIn && !lastDay) unset.lastWorkingDay = "";
  // An account switched off the old way has no roles: coming back restores the ones that were kept aside.
  if (statusMeta(to).canSignIn && (user.roles ?? []).length === 0 && (user.savedRoles ?? []).length > 0) {
    set.roles = user.savedRoles;
    unset.savedRoles = "";
  }
  await db.collection<UserDoc>(USERS).updateOne({ _id: user._id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) } as never);

  // Cannot sign in any more: every sign-in ends now, in every product.
  if (!canSignIn({ status: to, roles: ["x"] })) await revokeSessionsOf(user._id, `account_${to}`);

  const actor = ObjectId.isValid(meta.actorId) ? await db.collection<UserDoc>(USERS).findOne({ _id: new ObjectId(meta.actorId) }, { projection: { email: 1 } }) : null;
  await db.collection(STATUS_EVENTS_COLLECTION).insertOne({ userId: String(user._id), email: user.email, from, to, reason, lastWorkingDay: lastDay, actorId: meta.actorId, actorEmail: actor?.email ?? null, source: meta.source, at: now } as never);
  await recordAccessAudit({ actorId: meta.actorId, action: "account.status", target: user.email, detail: `${statusMeta(from).label} → ${statusMeta(to).label}${reason ? `: ${reason}` : ""}` });

  if (meta.source === "users") {
    const emp = await employeeFor(user);
    if (emp) {
      const empSet: Record<string, unknown> = { status: toEmployeeStatus(to), updatedAt: now, adminUserId: String(user._id) };
      if (lastDay && !canSignIn({ status: to, roles: ["x"] })) empSet["professional.relievingDate"] = lastDay;
      else if (lastDay && to === "notice_period") empSet["professional.relievingDate"] = lastDay;
      else if (canSignIn({ status: to, roles: ["x"] }) && to !== "notice_period") empSet["professional.relievingDate"] = null;
      await db.collection(EMPLOYEES).updateOne({ _id: emp._id } as never, { $set: empSet });
    }
  }
}

export type StatusResult = { ok: true } | { ok: false; error: string };

/** A person with the right to manage users changes someone's status. */
export async function changeAccountStatus(
  targetId: string,
  to: string,
  actor: { id: string; roles: readonly string[] },
  input: { reason?: string; lastWorkingDay?: string | null },
): Promise<StatusResult> {
  if (!ObjectId.isValid(targetId)) return { ok: false, error: "Unknown account." };
  if (!isAccountStatus(to)) return { ok: false, error: "Choose a valid status." };
  const col = (await getDb()).collection<UserDoc>(USERS);
  const target = await col.findOne({ _id: new ObjectId(targetId) });
  if (!target) return { ok: false, error: "Unknown account." };
  const isDirector = (target.roles ?? []).includes("super_admin");
  const problem = checkStatusChange({
    actor: { id: actor.id, isDirector: actor.roles.includes("super_admin") },
    target: { id: targetId, isDirector, status: statusOf(target) },
    to,
    reason: input.reason ?? "",
    lastWorkingDay: input.lastWorkingDay ?? null,
    otherActiveDirectors: isDirector ? await otherActiveDirectors(target._id) : 1,
    today: todayIso(),
  });
  if (problem) return { ok: false, error: problem };

  // Coming back needs something to come back to: an account with no roles at all has to be given a designation first.
  if (canSignIn({ status: to, roles: ["x"] }) && (target.roles ?? []).length === 0 && (target.savedRoles ?? []).length === 0 && !target.platformRoleId) {
    return { ok: false, error: "This account has no designation, so there is no access to give back. Give them a designation first." };
  }
  // Coming back from a status that could not sign in takes a seat again.
  if (canSignIn({ status: to, roles: ["x"] }) && !canSignIn(target) && rolesUseSeat(target.roles?.length ? target.roles : target.savedRoles)) {
    const block = await seatBlockReason(1);
    if (block) return { ok: false, error: block };
  }
  await apply(target, to, { actorId: actor.id, reason: input.reason, lastWorkingDay: input.lastWorkingDay, source: "users" });
  return { ok: true };
}

/** The history of one account's status, newest first. */
export async function listStatusHistory(userId: string, limit = 50): Promise<StatusEventRow[]> {
  const rows = await (await getDb()).collection(STATUS_EVENTS_COLLECTION).find({ userId }).sort({ at: -1 }).limit(limit).toArray();
  return rows.map((r) => ({
    id: String(r._id),
    at: new Date(r.at as Date).toISOString(),
    from: r.from as AccountStatus,
    to: r.to as AccountStatus,
    reason: String(r.reason ?? ""),
    lastWorkingDay: (r.lastWorkingDay as string | null) ?? null,
    actorEmail: (r.actorEmail as string | null) ?? null,
    source: (r.source as "users" | "hrms") ?? "users",
  }));
}

/**
 * The HR file changed (a status set in TalentOS): the person's account follows, so someone HR marks as relieved or terminated can no longer
 * sign in. Never blocks the HR change itself: a Director, or the last one, keeps their account (their status is changed in Users).
 */
export async function syncAccountFromEmployee(employeeId: string, hrStatus: string, actorId: string, relievingDate?: string | null): Promise<void> {
  try {
    const to = fromEmployeeStatus(hrStatus);
    if (!to) return;
    const db = await getDb();
    const emp = await db.collection<{ _id: string; adminUserId?: string | null; workEmail?: string }>(EMPLOYEES).findOne({ _id: employeeId } as never);
    if (!emp) return;
    const or: Record<string, unknown>[] = [{ employeeId }, { email: String(emp.adminUserId ?? "").toLowerCase() }, { email: String(emp.workEmail ?? "").toLowerCase() }];
    if (emp.adminUserId && ObjectId.isValid(emp.adminUserId)) or.push({ _id: new ObjectId(emp.adminUserId) });
    const user = await db.collection<UserDoc>(USERS).findOne({ $or: or } as never);
    if (!user || statusOf(user) === to) return;
    if (String(user._id) === actorId) return; // nobody ends their own access from their own HR file
    const isDirector = (user.roles ?? []).includes("super_admin");
    if (isDirector && BLOCKED_STATUSES.includes(to)) return; // a Director's access is changed in Users, with its last-Director check
    if (canSignIn({ status: to, roles: ["x"] }) && !canSignIn(user) && rolesUseSeat(user.roles) && (await seatBlockReason(1))) return;
    await apply(user, to, { actorId, reason: "Changed in the HR file", lastWorkingDay: relievingDate ?? null, source: "hrms" });
  } catch (err) {
    console.error("[account-status] could not follow the HR file", err);
  }
}
