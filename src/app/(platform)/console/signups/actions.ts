"use server";

import { revalidatePath } from "next/cache";
import { checkPlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { getSignupMode, setSignupMode } from "@/lib/platform/settings";
import { approveSignup, rejectSignup } from "@/lib/platform/signup";
import { requestOrigin } from "@/lib/platform/request";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Kept for callers of the old location; the control now lives in Platform settings. */
export async function setSignupModeAction(mode: string): Promise<ActionResult> {
  const auth = await checkPlatformPermission("signups.manage");
  if (!auth.ok) return auth;
  if (mode !== "open" && mode !== "approval" && mode !== "closed") return { ok: false, error: "Unknown sign-up mode." };
  const previous = await getSignupMode();
  await setSignupMode(mode, auth.user.id);
  await recordPlatformAudit({ actorId: auth.user.id, action: "settings.signup_mode.update", target: { type: "platform_settings", id: "signup" }, details: { from: previous, to: mode } });
  revalidatePath("/console", "layout");
  return { ok: true, message: "Sign-up mode saved." };
}

export async function approveSignupAction(id: string): Promise<ActionResult> {
  const auth = await checkPlatformPermission("signups.manage");
  if (!auth.ok) return auth;
  const { host } = await requestOrigin();
  const res = await approveSignup(String(id), { hostHint: host });
  revalidatePath("/console", "layout");
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: "signup.approve", target: { type: "signup", id: String(id) }, companyId: res.companyId, details: { host: res.host, emailed: res.emailed } });
  return { ok: true, message: res.emailed ? `Approved — ${res.host} is live and the owner has been emailed a sign-in link.` : `Approved — ${res.host} is live, but the email to the owner failed. Send them the address yourself.` };
}

export async function rejectSignupAction(id: string): Promise<ActionResult> {
  const auth = await checkPlatformPermission("signups.manage");
  if (!auth.ok) return auth;
  const res = await rejectSignup(String(id));
  revalidatePath("/console", "layout");
  if (!res.ok) return res;
  await recordPlatformAudit({ actorId: auth.user.id, action: "signup.reject", target: { type: "signup", id: String(id) }, details: { emailed: res.emailed } });
  return { ok: true, message: res.emailed ? "Rejected — the person has been told by email." : "Rejected, but the email to the person failed." };
}
