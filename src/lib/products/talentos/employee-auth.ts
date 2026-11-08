import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/security/password";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getEmployee } from "@/lib/products/talentos/employees";
import { newAccountBlockReason, rollbackIfOverSeats } from "@/lib/platform/billing/enforce";

/**
 * Employee self-service login provisioning. An employee login is an
 * `admin_users` document with `roles: ["employee"]` and an `employeeId` link.
 * There is exactly one login per employee. HR sets a temporary password that
 * the employee must change on first sign-in (`mustChangePassword`).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LmsUserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  roles?: string[];
  employeeId?: string | null;
  mustChangePassword?: boolean;
  name?: string;
  status?: string;
}

export function generateTempPassword(): string {
  // 12 chars, url-safe, always includes a digit + letter mix.
  return randomBytes(9).toString("base64url").slice(0, 12);
}

async function users() {
  const db = await getDb();
  return db.collection<LmsUserDoc>("admin_users");
}

export interface LoginStatus {
  hasLogin: boolean;
  email: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  disabled: boolean;
}

export async function loginStatusForEmployee(employeeId: string): Promise<LoginStatus> {
  const col = await users();
  const doc = await col.findOne({ employeeId, roles: "employee" });
  if (!doc) return { hasLogin: false, email: null, mustChangePassword: false, lastLoginAt: null, disabled: false };
  return {
    hasLogin: true,
    email: doc.email,
    mustChangePassword: doc.mustChangePassword === true,
    lastLoginAt: doc.lastLoginAt ? doc.lastLoginAt.toISOString() : null,
    disabled: !Array.isArray(doc.roles) || !doc.roles.includes("employee"),
  };
}

export async function loginStatusForEmployees(ids: string[]): Promise<Map<string, LoginStatus>> {
  const col = await users();
  const docs = await col.find({ employeeId: { $in: ids }, roles: "employee" }).toArray();
  const map = new Map<string, LoginStatus>();
  for (const id of ids) map.set(id, { hasLogin: false, email: null, mustChangePassword: false, lastLoginAt: null, disabled: false });
  for (const d of docs) {
    if (!d.employeeId) continue;
    map.set(d.employeeId, {
      hasLogin: true,
      email: d.email,
      mustChangePassword: d.mustChangePassword === true,
      lastLoginAt: d.lastLoginAt ? d.lastLoginAt.toISOString() : null,
      disabled: false,
    });
  }
  return map;
}

export async function createEmployeeLogin(
  employeeId: string,
  emailRaw: string,
  tempPassword: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (tempPassword.length < 10) return { ok: false, error: "Temporary password must be at least 10 characters." };

  const employee = await getEmployee(employeeId);
  if (!employee) return { ok: false, error: "Employee not found." };

  const col = await users();
  const existingForEmployee = await col.findOne({ employeeId });
  if (existingForEmployee) return { ok: false, error: "This employee already has a login." };
  const existingEmail = await col.findOne({ email });
  if (existingEmail) return { ok: false, error: "That email is already in use by another account." };
  const seatBlock = await newAccountBlockReason(["employee"]);
  if (seatBlock) return { ok: false, error: seatBlock };

  const newId = new ObjectId();
  // HR gives the login the standard "Team Member" designation (their access follows it); the Director can change it on the People page.
  const { ensureDesignations, listCustomRoles, computeEffective, getCustomRoles } = await import("@/lib/products/commandos/custom-roles");
  await ensureDesignations();
  const teamMember = (await listCustomRoles()).find((r) => r.builtinKey === "team-member");
  const eff = teamMember ? computeEffective([], {}, await getCustomRoles([teamMember.id])) : { roles: ["employee"], overrides: {} };
  await col.insertOne({
    _id: newId,
    email,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    passwordHash: hashPassword(tempPassword),
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    lastLoginAt: null,
    roles: eff.roles.includes("employee") ? eff.roles : [...eff.roles, "employee"],
    permissionOverrides: eff.overrides,
    manualRoles: [],
    manualOverrides: {},
    customRoleIds: teamMember ? [teamMember.id] : [],
    designationId: teamMember?.id ?? null,
    status: "active",
    employeeId,
    mustChangePassword: true,
  } as never);
  {
    const overSeats = await rollbackIfOverSeats(newId);
    if (overSeats) return { ok: false, error: overSeats };
  }
  // Keep the reverse link on the employee record too.
  const db = await getDb();
  await db.collection<{ _id: string; adminUserId: string | null }>("hrms_employees").updateOne(
    { _id: employeeId },
    { $set: { adminUserId: email } }
  );

  return { ok: true, email };
}

export async function resetEmployeeLoginPassword(
  employeeId: string,
  tempPassword: string
): Promise<{ ok: boolean; error?: string }> {
  if (tempPassword.length < 10) return { ok: false, error: "Temporary password must be at least 10 characters." };
  const col = await users();
  const res = await col.updateOne(
    { employeeId, roles: "employee" },
    { $set: { passwordHash: hashPassword(tempPassword), mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null } }
  );
  return res.matchedCount === 1 ? { ok: true } : { ok: false, error: "No login for this employee." };
}

export async function revokeEmployeeLogin(employeeId: string): Promise<{ ok: boolean; error?: string }> {
  const col = await users();
  const doc = await col.findOne({ employeeId, roles: "employee" });
  if (!doc) return { ok: false, error: "No login for this employee." };
  // Delete outright — the account exists only for portal access. Every sign-in it had ends first.
  await (await import("@/lib/cross-module-sso")).revokeSessionsOf(doc._id, "login_removed");
  await col.deleteOne({ _id: doc._id });
  const db = await getDb();
  await db.collection("hrms_sessions").deleteMany({ adminId: doc._id });
  return { ok: true };
}
