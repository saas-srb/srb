import "server-only";
import { CHAT_ROLE_META, CHAT_ROLES } from "@/lib/messenger-roles";
import { listMemberChannels } from "@/lib/products/huddle-ai/channels";
import { listDepartments } from "@/lib/products/talentos/departments";

/** Audience picker options for the announcement composer. */
export async function getAudienceOptions(userId: string) {
  const [channels, departments] = await Promise.all([
    listMemberChannels(userId, "team"),
    listDepartments().catch(() => []),
  ]);
  return {
    roleOptions: CHAT_ROLES.filter((r) => r !== "super_admin").map((r) => ({ value: r, label: CHAT_ROLE_META[r].label })),
    departmentOptions: departments.map((d) => ({ value: d._id, label: d.name })),
    channelOptions: channels.map((c) => ({ value: c._id, label: `#${c.name}` })),
  };
}
