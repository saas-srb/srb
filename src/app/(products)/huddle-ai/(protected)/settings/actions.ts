"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { updatePreferences } from "@/lib/products/huddle-ai/users";
import { heartbeat } from "@/lib/products/huddle-ai/presence";
import { recordAudit } from "@/lib/products/huddle-ai/audit";

export interface SettingsState {
  error?: string;
  ok?: boolean;
}

export async function saveMessengerSettingsAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");

  const displayName = String(formData.get("displayName") ?? "").trim();
  const soundEnabled = formData.get("soundEnabled") === "on";
  const presenceDefault = String(formData.get("presenceDefault") ?? "online") as
    | "online"
    | "away"
    | "busy"
    | "in_meeting";

  if (displayName.length < 2 || displayName.length > 60) {
    return { error: "Display name must be 2–60 characters." };
  }

  const db = await getDb();
  if (ObjectId.isValid(user.id)) {
    await db
      .collection<{ _id: ObjectId }>("admin_users")
      .updateOne({ _id: new ObjectId(user.id) }, { $set: { chatDisplayName: displayName } });
  }
  await db
    .collection<{ _id: string }>("chat_users")
    .updateOne({ _id: user.id }, { $set: { displayName, updatedAt: new Date() } });
  await updatePreferences(user.id, { soundEnabled, presenceDefault });
  await heartbeat(user.id, presenceDefault);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "settings", entityId: user.id, summary: "profile + preferences" });

  revalidatePath("/huddle-ai", "layout");
  return { ok: true };
}
