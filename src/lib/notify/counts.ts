import "server-only";
import { getDb } from "@/lib/mongodb";
import { hasLevel } from "@/lib/ai/agent/access";
import { unreadCount as hrmsUnread } from "@/lib/products/talentos/notifications";
import { unreadCount as pmsUnread } from "@/lib/products/sprintos/notifications";
import { unreadCount as prmsUnread } from "@/lib/products/spendiq/notifications";
import { unreadCount as tmsUnread } from "@/lib/products/cohort-ai/notifications";
import { unreadCount as messengerUnread, NOTIFICATIONS_COLLECTION as CHAT_STORE } from "@/lib/products/huddle-ai/notifications";
import { unreadCount as platformUnread } from "@/lib/platform/notifications";
import { portalUnreadCount } from "@/lib/products/clientos/notifications";
import { workspaceUnreadCount } from "@/lib/products/commandos/notifications";
import { panelUnread } from "@/lib/notify";
import { CHAT_STORE_PREFIXES, type NotifyPanel } from "@/lib/notify/panels";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getPlatformAccessForUser } from "@/lib/platform/console/roles";
import type { WorkspaceUser } from "@/lib/products/commandos/access";

export interface StaffViewer { id: string; roles: string[]; permissionOverrides?: Record<string, boolean> | null }
export type UnreadMap = Partial<Record<NotifyPanel, number>>;

const UNIFIED: NotifyPanel[] = ["fms", "lms", "lpms", "cms", "intelligence", "support"];
const safe = async (fn: () => Promise<number>) => fn().catch(() => 0);

/** Unread count for each product THIS person can open — a product they cannot open is simply absent (never 0-with-a-peek). */
export async function unreadForStaff(user: StaffViewer): Promise<UnreadMap> {
  const out: UnreadMap = {};
  const can = (p: NotifyPanel) => hasLevel(user.roles, p, "any");
  const jobs: Promise<void>[] = [];
  const put = (p: NotifyPanel, fn: () => Promise<number>) => jobs.push(safe(fn).then((n) => void (out[p] = n)));

  if (can("hrms")) put("hrms", () => hrmsUnread({ id: user.id, roles: user.roles as never }));
  if (can("pms")) put("pms", () => pmsUnread(user.id));
  if (can("prms")) put("prms", () => prmsUnread(user.id));
  if (can("tms")) put("tms", () => tmsUnread(user.id));
  if (can("messenger")) put("messenger", () => messengerUnread(user.id));
  for (const p of CHAT_STORE_PREFIXES) {
    if (p !== "ots" && p !== "seo" && p !== "sop" && p !== "dlms" && p !== "aibots" && p !== "smms") continue;
    if (can(p)) put(p, async () => (await getDb()).collection(CHAT_STORE).countDocuments({ recipientUserId: user.id, type: { $regex: `^${p}_` }, read: false }));
  }
  for (const p of UNIFIED) if (p === "support" || can(p)) put(p, () => panelUnread(user.id, p));
  put("workspace", () => workspaceUnreadCount({ ...(user as unknown as WorkspaceUser), roles: user.roles }));
  jobs.push(
    (async () => {
      if (!(await isPlatformOwnerContext())) return;
      if (!(await getPlatformAccessForUser(user.id))) return;
      out.platform = await safe(() => platformUnread(user.id));
    })().catch(() => {}),
  );
  await Promise.all(jobs);
  return out;
}

export async function unreadForPortal(userId: string): Promise<UnreadMap> {
  return { portal: await safe(() => portalUnreadCount(userId)) };
}
