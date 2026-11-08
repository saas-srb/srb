"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { signOutThisDevice } from "@/lib/security/sessions";

/**
 * Centralized logout: destroys this account's session in EVERY product (not
 * just PMS's own), on every device — see `cross-module-sso.ts`.
 */
export async function pmsLogoutAction(): Promise<void> {
  const user = await getCurrentPmsUser();
  if (user && ObjectId.isValid(user.id)) {
    await signOutThisDevice(new ObjectId(user.id));
  }
  redirect("/commandos/login");
}
