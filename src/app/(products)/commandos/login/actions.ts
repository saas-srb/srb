"use server";

import {
  verifyHubCredentials,
  createHubSession,
  setHubSessionCookie,
  getSessionHubUser,
} from "@/lib/hub-auth";
import { safeNextPath } from "@/lib/workspace-session";
import { provisionAccessibleSessions } from "@/lib/cross-module-sso";
import { endOtherDevices, otherDevices, startLoginSession } from "@/lib/security/sessions";
import { consumeTakeoverTicket, createTakeoverTicket, oneDeviceLimitApplies } from "@/lib/security/device-limit";
import type { ObjectId } from "mongodb";
import { loginLanding } from "@/lib/platform/onboarding/state";

export interface HubLoginState {
  error?: string;
  /** The password was right and the account has two-step sign-in: the form now asks for the code. */
  needsCode?: boolean;
  /** Which second step is asked for, and (email) where the code was sent, masked. */
  method?: "app" | "email";
  hint?: string;
  /** A plain message (not an error), e.g. "We sent a code to j***@acme.com". */
  info?: string;
  /** The plan allows one device at a time and the account is signed in elsewhere: the page asks before signing that device out. */
  /** Signed in: the form opens this address with a full page load, so nothing the browser kept from before sign-in is reused. */
  redirectTo?: string;
  conflict?: { ticket: string; devices: { label: string; detail: string; place: string; lastActiveAt: string }[] };
}

export async function hubLoginAction(_prevState: HubLoginState, formData: FormData): Promise<HubLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const result = await verifyHubCredentials(email, password, String(formData.get("code") ?? ""), { resend: formData.get("resend") === "1" });
  if (!result.ok) {
    return { error: result.error, needsCode: result.needsCode, method: result.method, hint: result.hint, info: result.info };
  }

  // Free plan: one device at a time. If the account is already signed in somewhere else, nothing is signed in yet: the person is asked first.
  if (await oneDeviceLimitApplies()) {
    const others = await otherDevices(result.adminId);
    if (others.length) {
      const ticket = await createTakeoverTicket(result.adminId, email);
      return { conflict: { ticket, devices: others.map((d) => ({ label: d.deviceLabel, detail: [d.browser, d.os].filter((x) => x && x !== "Unknown").join(" on ") || d.deviceLabel, place: d.place, lastActiveAt: d.lastActiveAt })) } };
    }
  }
  return finishHubLogin(result.adminId, email, formData.get("next"));
}

/** The person confirmed: the other device is signed out and this one signs in. The pass from the first step replaces the password check. */
export async function hubTakeoverAction(ticket: string, next: string | null): Promise<HubLoginState> {
  const t = await consumeTakeoverTicket(String(ticket ?? ""));
  if (!t) return { error: "This confirmation has expired. Please sign in again." };
  return finishHubLogin(t.adminId, t.email, next);
}

async function finishHubLogin(adminId: ObjectId, email: string, next: FormDataEntryValue | string | null): Promise<HubLoginState> {
  const limited = await oneDeviceLimitApplies();
  const startedAt = new Date();
  const token = await createHubSession(adminId);
  await setHubSessionCookie(token);

  // Mint a real session in every other product this account's roles actually
  // grant access to, so no separate login is needed to open them.
  await provisionAccessibleSessions(adminId, "hub");
  const loginId = await startLoginSession(adminId, { startedAt, email, via: "password" });
  if (limited) await endOtherDevices(adminId, loginId);

  const user = await getSessionHubUser(token);
  if (user?.mustChangePassword) return { redirectTo: "/commandos/change-password" };
  // Back to the product the person came from — validated again here, the form field is user input.
  // An explicit, validated `next` wins; otherwise an owner with open setup lands on the onboarding wizard.
  return { redirectTo: await loginLanding(user?.roles ?? [], safeNextPath(next), user?.id) };
}
