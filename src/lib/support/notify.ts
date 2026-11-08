import "server-only";
import { getPlatformOwnerCompanyId } from "@/lib/platform/tenancy/companies";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { notify } from "@/lib/platform/notifications";
import { getPlatformAccessForUser, listPlatformUsers } from "@/lib/platform/console/roles";
import { hasPermission } from "@/lib/platform/console/permissions";

/**
 * Tells the platform's support staff about activity. The staff are platform users in the owner company, so the
 * notification is written inside that company's scope. Never throws: a failed notification must not fail the request.
 */
export async function notifySupportStaff(input: { requestId: string; number: number; title: string; companyName: string; kind: "new" | "reply"; assigneeId?: string | null }): Promise<void> {
  try {
    const ownerId = await getPlatformOwnerCompanyId();
    if (!ownerId) return;
    await runAsCompany(ownerId, async () => {
      let userIds: string[];
      if (input.kind === "reply" && input.assigneeId) {
        userIds = [input.assigneeId];
      } else {
        // Everyone who can work the queue.
        const users = await listPlatformUsers();
        const flags = await Promise.all(users.map(async (u) => hasPermission((await getPlatformAccessForUser(u.id))?.permissions, "support.manage")));
        userIds = users.filter((_, i) => flags[i]).map((u) => u.id);
      }
      if (userIds.length === 0) return;
      await notify({
        to: { userIds },
        title: input.kind === "new" ? `New support request #${input.number} from ${input.companyName}` : `${input.companyName} replied on request #${input.number}`,
        body: input.title.slice(0, 200),
        url: `/console/resolveiq/${input.requestId}`,
      });
    });
  } catch (err) {
    console.error("[support] staff notification failed", err);
  }
}
