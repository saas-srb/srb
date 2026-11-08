import "server-only";
import { getDb } from "@/lib/mongodb";
import { normalizePhone } from "@/lib/products/clientos/db";
import type { PortalRole } from "@/lib/portal-roles";

/**
 * Self-registration identity match. Given the email + phone a person enters at
 * `/clientos/register`, find the single ERP domain record that is "them" and the
 * portal role it implies. No mailer exists in this repo, so the email+phone pair
 * IS the identity assertion.
 *
 * Priority when someone matches more than one record: `client` > active student
 * > applicant.
 */

export interface DomainMatch {
  role: PortalRole;
  applicationId?: string;
  studentId?: string;
  clientId?: string;
  displayName: string;
}

function ci(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

export async function matchDomainRecord(emailRaw: string, phoneRaw: string): Promise<DomainMatch | null> {
  const email = emailRaw.trim().toLowerCase();
  const phone = normalizePhone(phoneRaw);
  if (!email || phone.length < 7) return null;

  const db = await getDb();

  // --- client (highest priority) -------------------------------------------
  const client = await db
    .collection<{ _id: string; companyName: string; primaryContact?: { name?: string; email?: string | null; phone?: string | null } }>(
      "pms_clients"
    )
    .findOne({ deletedAt: null, "primaryContact.email": ci(email) });
  if (client && normalizePhone(client.primaryContact?.phone ?? "") === phone) {
    return { role: "client", clientId: client._id, displayName: client.primaryContact?.name || client.companyName };
  }

  // --- training student (intern / trainee) --------------------------------
  const student = await db
    .collection<{ _id: string; fullName: string; email?: string | null; mobile?: string | null; status?: string }>(
      "training_students"
    )
    .findOne({ deletedAt: null, email: ci(email) });
  if (student && normalizePhone(student.mobile ?? "") === phone) {
    const role = await studentRole(student._id);
    return { role, studentId: student._id, displayName: student.fullName };
  }

  // --- job applicant -----------------------------------------------------
  const application = await db
    .collection<{ _id: unknown; name: string; email: string; phone: string }>("career_applications")
    .findOne({ email: ci(email) }, { sort: { createdAt: -1 } });
  if (application && normalizePhone(application.phone ?? "") === phone) {
    return { role: "job_applicant", applicationId: String(application._id), displayName: application.name };
  }

  return null;
}

/** intern vs trainee from the student's most relevant enrollment's program category. */
export async function studentRole(studentId: string): Promise<PortalRole> {
  const db = await getDb();
  const enrollments = await db
    .collection<{ studentId: string; programId: string; status: string; enrolledOn?: string }>("student_enrollments")
    .find({ studentId, deletedAt: null })
    .toArray();
  if (enrollments.length === 0) return "trainee";
  const active = enrollments.find((e) => e.status === "active") ?? enrollments.sort((a, b) => (b.enrolledOn ?? "").localeCompare(a.enrolledOn ?? ""))[0];
  const program = await db
    .collection<{ _id: string; category?: string }>("training_programs")
    .findOne({ _id: active.programId });
  return program?.category === "internship" ? "intern" : "trainee";
}
