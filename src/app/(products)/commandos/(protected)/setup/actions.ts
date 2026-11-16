"use server";

import { limitAction } from "@/lib/security/action-limit";
import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { isDirector } from "@/lib/access/director";
import { setNotApplicable, setReviewed } from "@/lib/platform/setup-progress/store";

const KEY = "company.progress";

/** Only a Director may mark a step (the same people who can open the page). Both marks are reversible and audited. */
export async function reviewStepAction(id: string, on: boolean): Promise<{ ok: boolean; error?: string }> {
  const user = await requireWorkspaceAction(KEY);
  if (!isDirector(user)) return { ok: false, error: "Only a Director can do this." };
  const slow = await limitAction(user.id, "setup-mark", 60, 600);
  if (slow) return { ok: false, error: slow };
  const r = await setReviewed(String(id), Boolean(on), user.id);
  revalidatePath("/commandos/setup");
  revalidatePath("/commandos");
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function notApplicableStepAction(id: string, on: boolean, reason: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireWorkspaceAction(KEY);
  if (!isDirector(user)) return { ok: false, error: "Only a Director can do this." };
  const slow = await limitAction(user.id, "setup-mark", 60, 600);
  if (slow) return { ok: false, error: slow };
  const r = await setNotApplicable(String(id), Boolean(on), String(reason ?? ""), user.id);
  revalidatePath("/commandos/setup");
  revalidatePath("/commandos");
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
