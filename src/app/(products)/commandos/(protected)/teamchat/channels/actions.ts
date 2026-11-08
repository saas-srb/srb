"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { archiveChannel, getChannel } from "@/lib/products/huddle-ai/channels";
import { recordAudit } from "@/lib/products/huddle-ai/audit";

function revalidate() {
  revalidatePath("/commandos/teamchat/channels");
}

export async function setChannelArchivedAction(id: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.teamchat.channels");
  const before = await getChannel(id);
  if (!before) return { ok: false, error: "Channel not found." };
  await archiveChannel(id, admin.id, archived);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: archived ? "archive" : "unarchive",
    entity: "channel",
    entityId: id,
    entityLabel: before.name,
  });
  revalidate();
  return { ok: true };
}

export async function bulkSetChannelArchivedAction(ids: string[], archived: boolean): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.teamchat.channels");
  let updated = 0;
  for (const id of ids) {
    const before = await getChannel(id);
    if (!before) continue;
    await archiveChannel(id, admin.id, archived);
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: archived ? "archive" : "unarchive",
      entity: "channel",
      entityId: id,
      entityLabel: before.name,
    });
    updated += 1;
  }
  revalidate();
  return { updated };
}
