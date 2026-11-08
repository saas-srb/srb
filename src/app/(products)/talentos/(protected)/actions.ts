"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { signOutThisDevice } from "@/lib/security/sessions";

/**
 * Centralized logout: destroys this account's session in EVERY product (not
 * just HRMS's own), on every device — see `cross-module-sso.ts`.
 */
export async function hrmsLogoutAction(): Promise<void> {
  const user = await getCurrentHrmsUser();
  if (user && ObjectId.isValid(user.id)) {
    await signOutThisDevice(new ObjectId(user.id));
  }
  redirect("/commandos/login");
}
