"use server";

import { redirect } from "next/navigation";
import { acceptInvitation } from "@/lib/platform/invitations";
import { createHubSession, setHubSessionCookie } from "@/lib/hub-auth";
import { provisionAccessibleSessions } from "@/lib/cross-module-sso";
import { startLoginSession } from "@/lib/security/sessions";

export interface AcceptState {
  error?: string;
}

export async function acceptInvitationAction(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const result = await acceptInvitation(String(formData.get("token") ?? ""), {
    name: String(formData.get("name") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  // Signed straight in — same SSO as a normal workspace login.
  const startedAt = new Date();
  await setHubSessionCookie(await createHubSession(result.adminId));
  await provisionAccessibleSessions(result.adminId, "hub");
  await startLoginSession(result.adminId, { startedAt, email: "", via: "invite" });
  redirect("/commandos");
}
