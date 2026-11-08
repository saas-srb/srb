"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentLmsUser } from "@/lib/lms-auth";
import { signOutThisDevice } from "@/lib/security/sessions";

/**
 * Centralized logout: destroys this account's session in EVERY product (not
 * just LMS's own), on every device — see `cross-module-sso.ts`.
 */
export async function logoutAction(): Promise<void> {
  const user = await getCurrentLmsUser();
  if (user && ObjectId.isValid(user.id)) {
    await signOutThisDevice(new ObjectId(user.id));
  }
  redirect("/commandos/login");
}
