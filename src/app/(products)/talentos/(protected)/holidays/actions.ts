"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageHolidays } from "@/lib/hrms-roles";
import { createHoliday, updateHoliday, deleteHoliday } from "@/lib/products/talentos/holidays";
import { validateHoliday } from "@/lib/products/talentos/validation-ops";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface HolidayActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireHolidays() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageHolidays(user)) throw new Error("Forbidden");
  return user;
}

function revalidate() {
  revalidatePath("/talentos/holidays");
  revalidatePath("/talentos/attendance");
  revalidatePath("/talentos/leave");
}

export async function saveHolidayAction(input: Record<string, unknown>, id?: string): Promise<HolidayActionResult> {
  const user = await requireHolidays();
  const v = validateHoliday(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const result = id ? await updateHoliday(id, v.data, user.id) : await createHoliday(v.data, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: id ? "update" : "create",
    entity: "holiday",
    entityId: result.holiday._id,
    entityLabel: `${v.data.name} (${v.data.date})`,
  });

  revalidate();
  return { ok: true };
}

export async function deleteHolidayAction(id: string): Promise<HolidayActionResult> {
  const user = await requireHolidays();
  const ok = await deleteHoliday(id, user.id);
  if (!ok) return { ok: false, error: "Holiday not found." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "holiday", entityId: id });
  revalidate();
  return { ok: true };
}
