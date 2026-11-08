"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { signOutThisDevice } from "@/lib/security/sessions";

/**
 * Centralized logout: destroys this account's session in EVERY product (not
 * just TMS's own), on every device — see `cross-module-sso.ts`.
 */
export async function tmsLogoutAction(): Promise<void> {
  const user = await getCurrentTmsUser();
  if (user && ObjectId.isValid(user.id)) {
    await signOutThisDevice(new ObjectId(user.id));
  }
  redirect("/commandos/login");
}
