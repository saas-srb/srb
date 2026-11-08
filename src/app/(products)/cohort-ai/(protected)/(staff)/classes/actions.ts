"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import {
  createClass,
  updateClass,
  deleteClass,
  getClass,
  markAttendance,
  isValidAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/products/cohort-ai/classes";
import { getBatch } from "@/lib/products/cohort-ai/batches";
import { validateClass } from "@/lib/products/cohort-ai/validation";
import { recordAudit, diffSummary } from "@/lib/products/cohort-ai/audit";
import { notifyBatchStudents } from "@/lib/products/cohort-ai/notifications";

export interface ClassActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentTmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTraining(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string, batchId?: string) {
  revalidatePath("/cohort-ai/classes");
  revalidatePath("/cohort-ai");
  if (id) revalidatePath(`/cohort-ai/classes/${id}`);
  if (batchId) revalidatePath(`/cohort-ai/batches/${batchId}`);
}

export async function saveClassAction(
  input: Record<string, unknown>,
  id?: string
): Promise<ClassActionResult> {
  const user = await requireManage();
  const v = validateClass(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const batch = await getBatch(v.data.batchId);
  if (!batch) return { ok: false, fieldErrors: { batchId: "That batch no longer exists." } };

  if (id) {
    const before = await getClass(id);
    if (!before) return { ok: false, error: "Class not found." };
    const updated = await updateClass(id, v.data, user.id);
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "class",
      entityId: id,
      entityLabel: v.data.topic,
      summary: diffSummary(
        { topic: before.topic, date: before.date, status: before.status },
        { topic: v.data.topic, date: v.data.date, status: v.data.status },
        ["topic", "date", "status"]
      ),
    });
    revalidate(id, v.data.batchId);
    return { ok: true, id: updated?._id };
  }

  const created = await createClass(v.data, batch.programId, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "class",
    entityId: created._id,
    entityLabel: v.data.topic,
    metadata: { batchCode: batch.batchCode, date: v.data.date },
  });
  await notifyBatchStudents(v.data.batchId, {
    type: "class_scheduled",
    title: "Class scheduled",
    body: `${v.data.topic} · ${v.data.date}${v.data.startTime ? ` ${v.data.startTime}` : ""}`,
    link: "/cohort-ai/me/schedule",
    dedupeKey: `class_scheduled:${created._id}`,
  });
  revalidate(created._id, v.data.batchId);
  return { ok: true, id: created._id };
}

export async function deleteClassAction(id: string): Promise<ClassActionResult> {
  const user = await requireManage();
  const before = await getClass(id);
  const ok = await deleteClass(id, user.id);
  if (!ok) return { ok: false, error: "Could not delete class." };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "class",
    entityId: id,
    entityLabel: before?.topic ?? null,
  });
  revalidate(id, before?.batchId);
  return { ok: true };
}

export async function markAttendanceAction(
  classId: string,
  entries: { studentId: string; status: string }[]
): Promise<ClassActionResult> {
  const user = await requireManage();
  const cls = await getClass(classId);
  if (!cls) return { ok: false, error: "Class not found." };

  const clean = entries
    .filter((e) => e.studentId && isValidAttendanceStatus(e.status))
    .map((e) => ({ studentId: e.studentId, status: e.status as AttendanceStatus }));
  if (clean.length === 0) return { ok: false, error: "No valid attendance entries." };

  await markAttendance(classId, cls.batchId, clean, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "class",
    entityId: classId,
    entityLabel: cls.topic,
    summary: `attendance marked for ${clean.length} student(s)`,
  });
  revalidate(classId, cls.batchId);
  return { ok: true, id: classId };
}
