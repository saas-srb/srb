"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPortalUser, externalUsers } from "@/lib/portal-auth";
import { normalizePhone } from "@/lib/products/clientos/db";
import { recordPortalAudit } from "@/lib/products/clientos/audit";
import { awardActivity } from "@/lib/wallet/earn";

export interface ProfileState {
  ok?: boolean;
  error?: string;
}

export async function updatePortalProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentPortalUser();
  if (!user) redirect("/login");

  const displayName = String(formData.get("displayName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (displayName.length < 2) return { error: "Please enter your name." };
  if (normalizePhone(phone).length < 10) return { error: "Enter a valid phone number." };

  const users = await externalUsers();
  await users.updateOne(
    { _id: user.id },
    { $set: { displayName, phone, updatedAt: new Date() } }
  );
  await recordPortalAudit({ actorId: user.id, action: "profile_update", entity: "account", entityId: user.id });
  await awardActivity({ userId: user.id, role: user.role, type: "profile_complete", key: user.id });
  revalidatePath("/clientos/profile");
  return { ok: true };
}
