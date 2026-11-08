"use server";

import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getCurrentIntelligenceUser } from "@/lib/intelligence-auth";
import { intelligenceCan } from "@/lib/intelligence-roles";
import { signOutThisDevice } from "@/lib/security/sessions";
import { deleteConversation } from "@/lib/products/databrain-ai/conversations";

/** Every action resolves the user from the SESSION and only ever touches that user's own conversations. */

export async function deleteConversationAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentIntelligenceUser();
  if (!user || !intelligenceCan(user, "USE")) return { ok: false, error: "Your session has expired — please sign in again." };
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: false, error: "That conversation no longer exists." };
  const done = await deleteConversation(user.id, id);
  return done ? { ok: true } : { ok: false, error: "That conversation no longer exists." };
}

export async function intelligenceLogoutAction(): Promise<void> {
  const user = await getCurrentIntelligenceUser();
  if (user && ObjectId.isValid(user.id)) await signOutThisDevice(new ObjectId(user.id));
  redirect("/commandos/login");
}
