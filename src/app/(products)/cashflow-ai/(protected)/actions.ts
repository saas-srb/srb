"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { signOutThisDevice } from "@/lib/security/sessions";

/**
 * Centralized logout: destroys this account's session in EVERY product (not
 * just FMS's own), on every device — see `cross-module-sso.ts`.
 */
export async function fmsLogoutAction(): Promise<void> {
  const user = await getCurrentFmsUser();
  if (user && ObjectId.isValid(user.id)) {
    await signOutThisDevice(new ObjectId(user.id));
  }
  redirect("/commandos/login");
}
