import { studentLoginBlockReason } from "@/lib/platform/billing/enforce";
import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/security/password";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getStudent } from "@/lib/products/cohort-ai/students";

/**
 * Student portal login provisioning. A student login is an `admin_users`
 * document with `roles: ["training_student"]` and a `studentId` link — the
 * same shared identity store the staff products use. Exactly one login per
 * student. Staff set a temporary password the student must change on first
 * sign-in. Mirrors `src/lib/talentos/employee-auth.ts`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AdminUserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  roles?: string[];
  studentId?: string | null;
  mustChangePassword?: boolean;
}

export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

async function users() {
  const db = await getDb();
  return db.collection<AdminUserDoc>("admin_users");
}

export interface StudentLoginStatus {
  hasLogin: boolean;
  email: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export async function loginStatusForStudent(studentId: string): Promise<StudentLoginStatus> {
  const col = await users();
  const doc = await col.findOne({ studentId, roles: "training_student" });
  if (!doc) return { hasLogin: false, email: null, mustChangePassword: false, lastLoginAt: null };
  return {
    hasLogin: true,
    email: doc.email,
    mustChangePassword: doc.mustChangePassword === true,
    lastLoginAt: doc.lastLoginAt ? doc.lastLoginAt.toISOString() : null,
  };
}

export async function createStudentLogin(
  studentId: string,
  emailRaw: string,
  tempPassword: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (tempPassword.length < 10) return { ok: false, error: "Temporary password must be at least 10 characters." };

  const student = await getStudent(studentId);
  if (!student) return { ok: false, error: "Student not found." };

  const col = await users();
  if (await col.findOne({ studentId, roles: "training_student" })) {
    return { ok: false, error: "This student already has a portal login." };
  }
  if (await col.findOne({ email })) {
    return { ok: false, error: "That email is already in use by another account." };
  }

  const planBlock = await studentLoginBlockReason();
  if (planBlock) return { ok: false, error: planBlock };

  await col.insertOne({
    _id: new ObjectId(),
    email,
    passwordHash: hashPassword(tempPassword),
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    lastLoginAt: null,
    roles: ["training_student"],
    studentId,
    mustChangePassword: true,
  });
  return { ok: true, email };
}

export async function resetStudentLoginPassword(
  studentId: string,
  tempPassword: string
): Promise<{ ok: boolean; error?: string }> {
  if (tempPassword.length < 10) return { ok: false, error: "Temporary password must be at least 10 characters." };
  const col = await users();
  const res = await col.updateOne(
    { studentId, roles: "training_student" },
    { $set: { passwordHash: hashPassword(tempPassword), mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null } }
  );
  return res.matchedCount === 1 ? { ok: true } : { ok: false, error: "No login for this student." };
}

export async function revokeStudentLogin(studentId: string): Promise<{ ok: boolean; error?: string }> {
  const col = await users();
  const doc = await col.findOne({ studentId, roles: "training_student" });
  if (!doc) return { ok: false, error: "No login for this student." };
  await col.deleteOne({ _id: doc._id });
  const db = await getDb();
  await db.collection("tms_sessions").deleteMany({ adminId: doc._id });
  return { ok: true };
}
