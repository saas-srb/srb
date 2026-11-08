"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { createChannel } from "@/lib/products/huddle-ai/channels";
import { recordAudit } from "@/lib/products/huddle-ai/audit";

/**
 * Group chats are `chat_channels` of `kind: "group"` — always private. Member
 * management, rename, archive and leave reuse the channel server actions in
 * `../channels/actions.ts` (they operate on a channel id, kind-agnostic); only
 * creation is group-specific.
 */
export async function createGroupAction(input: {
  name: string;
  description?: string;
  memberIds: string[];
}): Promise<{ error: string } | never> {
  const user = await getCurrentChatUser();
  if (!user) redirect("/huddle-ai/login");

  const name = input.name.trim();
  if (name.length < 2) return { error: "Give the group a name." };
  if (input.memberIds.length === 0) return { error: "Add at least one other person." };

  const group = await createChannel(
    { kind: "group", name, description: input.description, visibility: "private", memberIds: input.memberIds },
    user.id
  );
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "channel",
    entityId: group._id,
    entityLabel: group.name,
    summary: "group chat",
  });
  revalidatePath("/huddle-ai/groups", "layout");
  redirect(`/huddle-ai/groups/${group.slug}`);
}
