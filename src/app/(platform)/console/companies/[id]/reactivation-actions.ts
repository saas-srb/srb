"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { decideRequest, type DecideResult } from "@/lib/platform/reactivation";

/** Approve (reactivates the company) or reject (with a reason that is emailed to the requester). */
export async function decideReactivationAction(requestId: string, decision: string, reason: string): Promise<DecideResult> {
  const auth = await checkPlatformPermission("companies.status");
  if (!auth.ok) return auth;
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "Unknown decision." };
  const res = await decideRequest(String(requestId), decision, String(reason ?? ""), auth.user.id);
  if (res.ok) revalidatePath("/console", "layout");
  return res;
}
