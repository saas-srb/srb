"use server";

import { revalidatePath } from "next/cache";
import { requirePmsEmployee, checkProjectAccess } from "@/lib/products/sprintos/access";
import { validateTimesheet } from "@/lib/products/sprintos/validation";
import { EDITABLE_TIMESHEET_STATUSES } from "@/lib/products/sprintos/constants";
import {
  createEntry,
  updateEntry,
  deleteEntry,
  getEntry,
  submitEntries,
  listEntries,
  isDuplicate,
  hasOverlap,
  dayHoursTotal,
} from "@/lib/products/sprintos/timesheets";
import { getTask } from "@/lib/products/sprintos/tasks";
import { getProject } from "@/lib/products/sprintos/projects";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";

export interface TimesheetActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate() {
  revalidatePath("/sprintos/me/timesheet");
  revalidatePath("/sprintos/me");
  revalidatePath("/sprintos/timesheets");
  revalidatePath("/sprintos/costing");
}

export async function saveTimesheetAction(
  input: Record<string, unknown>,
  entryId?: string
): Promise<TimesheetActionResult> {
  const me = await requirePmsEmployee();

  const v = validateTimesheet(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  // Employee must be on the project.
  const access = await checkProjectAccess(
    { id: me.userId, roles: me.roles, employeeId: me.employeeId },
    v.data.projectId
  );
  if (!access.allowed) return { ok: false, error: "You’re not assigned to that project." };

  // Task, if given, must belong to the project.
  if (v.data.taskId) {
    const task = await getTask(v.data.taskId);
    if (!task || task.projectId !== v.data.projectId) return { ok: false, error: "That task isn’t in the selected project." };
  }

  if (await isDuplicate(me.employeeId, v.data, entryId)) {
    return { ok: false, fieldErrors: { startTime: "You already logged this project/task at this time on this date." } };
  }
  if (await hasOverlap(me.employeeId, v.data, entryId)) {
    return { ok: false, fieldErrors: { startTime: "This overlaps another entry on the same day." } };
  }
  const dayTotal = await dayHoursTotal(me.employeeId, v.data.date, entryId);
  if (dayTotal + v.data.hours > 24) {
    return { ok: false, fieldErrors: { hours: `That would put ${v.data.date} over 24 logged hours.` } };
  }

  if (entryId) {
    const existing = await getEntry(entryId);
    if (!existing || existing.employeeId !== me.employeeId) return { ok: false, error: "Entry not found." };
    if (!(EDITABLE_TIMESHEET_STATUSES as string[]).includes(existing.status)) {
      return { ok: false, error: "Submitted or approved entries can’t be edited." };
    }
    const updated = await updateEntry(entryId, v.data, me.userId);
    revalidate();
    return { ok: true, id: updated?._id };
  }

  const created = await createEntry(me.employeeId, v.data, me.userId);
  revalidate();
  return { ok: true, id: created._id };
}

export async function deleteTimesheetAction(entryId: string): Promise<TimesheetActionResult> {
  const me = await requirePmsEmployee();
  const existing = await getEntry(entryId);
  if (!existing || existing.employeeId !== me.employeeId) return { ok: false, error: "Entry not found." };
  if (!(EDITABLE_TIMESHEET_STATUSES as string[]).includes(existing.status)) {
    return { ok: false, error: "Submitted or approved entries can’t be deleted." };
  }
  await deleteEntry(entryId, me.userId);
  revalidate();
  return { ok: true };
}

export async function submitTimesheetAction(ids: string[]): Promise<TimesheetActionResult> {
  const me = await requirePmsEmployee();
  const clean = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string");
  const n = await submitEntries(clean, me.employeeId);

  if (n > 0) {
    const submitted = await listEntries({ employeeId: me.employeeId, status: "submitted" });
    const projectIds = Array.from(new Set(submitted.filter((e) => clean.includes(e._id)).map((e) => e.projectId)));
    const pmIds = new Set<string>();
    for (const pid of projectIds) {
      const project = await getProject(pid);
      if (project?.projectManagerId) pmIds.add(project.projectManagerId);
    }
    if (pmIds.size > 0) {
      await notifyEmployees(Array.from(pmIds), (uid) => ({
        recipientUserId: uid,
        type: "timesheet_submitted",
        title: `${me.email} submitted ${n} timesheet ${n === 1 ? "entry" : "entries"}`,
        body: "Awaiting your review",
        link: "/sprintos/timesheets",
      }), me.userId);
    }
  }

  revalidate();
  return { ok: true, error: n === 0 ? "Nothing to submit." : undefined };
}
