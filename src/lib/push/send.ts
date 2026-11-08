import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { afterForCompany, currentCompanyIdOrNull, runAsCompany } from "@/lib/platform/tenancy/context";
import { inQuietHours, PUSH_CATEGORY_META, type PushCategory } from "@/lib/push/categories";
import { getPreferencesMany, subscriptionsCol, type PushActor } from "@/lib/push/store";
import { pushKeys, vapidDetails, webpush } from "@/lib/push/vapid";
import { logDeliveries, offDetail, planNotification } from "@/lib/notify/center/store";

/**
 * Sends a Web Push notification to people of the CURRENT company. Always best-effort: it never throws and never delays the
 * action that raised the notification. Respects each person's master switch, category choices and quiet hours, drops
 * subscriptions the push service says are gone, and only ever links to same-site paths.
 */

export interface PushMessage {
  category: PushCategory;
  title: string;
  body?: string | null;
  /** Same-site path opened when the notification is tapped. */
  url?: string | null;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string | null;
  /** false = push only, no email (the default is to email whoever's own settings allow it). */
  email?: boolean;
  /** The event type (e.g. `expense_approved`). With it, the company's Notification center decides which channels carry it and how it reads. */
  event?: string;
  /** The product (panel key) the event belongs to, for the Notification center's list and log. */
  product?: string;
  /** Email subject override (from the Notification center); by default derived from the title. */
  subject?: string;
  /** Narrows the channels for this one send (e.g. an announcement by email only); never widens what the company allows. */
  channels?: Partial<Record<"inApp" | "push" | "email", boolean>>;
  /** Email wording from the Notification center: greeting, button label and small print (with {firstName} / {settingsLink}), null = the original. */
  emailExtras?: { greeting: string | null; button: string | null; footnote: string | null };
}

const MAX_FAILURES = 5;
const CONCURRENCY = 10;

function safePath(url: string | null | undefined): string {
  const u = (url ?? "").trim();
  return u.startsWith("/") && !u.startsWith("//") && !u.includes("\\") && u.length <= 500 ? u : "/commandos/notifications";
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

/** Delivers to every device of `userIds` that wants it. Returns how many pushes the services accepted. */
export async function pushToUsers(actor: PushActor, userIds: string[], message: PushMessage): Promise<number> {
  try {
    const keys = await pushKeys();
    if (!keys) return 0;
    const ids = [...new Set(userIds.filter(Boolean))].slice(0, 500);
    if (ids.length === 0) return 0;

    const prefs = await getPreferencesMany(actor, ids);
    const urgent = PUSH_CATEGORY_META[message.category].urgent === true;
    const wanted = ids.filter((id) => {
      const p = prefs.get(id);
      if (!p) return true; // no saved choice = the defaults (everything on, no quiet hours)
      if (!p.enabled || !p.categories[message.category]) return false;
      return urgent || !inQuietHours(p.quietHours);
    });
    if (wanted.length === 0) return 0;

    const subs = await subscriptionsCol();
    const rows = await subs.find({ actor, userId: { $in: wanted } }).toArray();
    if (rows.length === 0) return 0;

    const payload = JSON.stringify({
      title: message.title.slice(0, 120),
      body: (message.body ?? "").slice(0, 300),
      url: safePath(message.url),
      tag: message.tag ?? undefined,
      category: message.category,
    });
    let delivered = 0;
    await mapLimit(rows, CONCURRENCY, async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, payload, { TTL: 60 * 60 * 24, urgency: urgent ? "high" : "normal", vapidDetails: vapidDetails(keys) });
        delivered++;
        await subs.updateOne({ _id: row._id }, { $set: { lastSuccessAt: new Date(), failures: 0 } });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed or the install was removed. Anything else counts toward giving up.
        if (status === 404 || status === 410) await subs.deleteOne({ _id: row._id });
        else if (row.failures + 1 >= MAX_FAILURES) await subs.deleteOne({ _id: row._id });
        else await subs.updateOne({ _id: row._id }, { $inc: { failures: 1 } });
      }
    });
    await logDeliveries([{ channel: "push", event: message.event ?? "other", product: message.product, title: message.title, status: delivered > 0 ? "sent" : "failed", recipient: `${wanted.length} ${wanted.length === 1 ? "person" : "people"}`, detail: `${delivered} of ${rows.length} ${rows.length === 1 ? "device" : "devices"} reached` }]);
    return delivered;
  } catch (err) {
    console.error("[push] delivery failed", err);
    return 0;
  }
}

/**
 * For the notification writers: schedules the out-of-app channels, push AND email, after the response (a serverless function may stop
 * right after it), inside the current company's scope. Outside a request (a cron, a script) it just runs them. Each is best-effort and
 * follows the person's own settings; one failing never stops the other. (The name is from when push was the only channel.)
 */
export async function queuePush(actor: PushActor, userIds: string[], message: PushMessage): Promise<void> {
  try {
    if (userIds.length === 0) return;
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return;
    const deliver = async () => {
      const { emailToUsers } = await import("@/lib/notify/email-channel");
      let pushMessage = message;
      let emailMessage = message;
      let pushOn = true;
      let emailOn = message.email !== false;
      // The company's Notification center: which channels carry this event, and any wording it changed.
      if (message.event) {
        const plan = await planNotification({ type: message.event, title: message.title, body: message.body, link: message.url, product: message.product, only: message.channels });
        pushOn = plan.push.on;
        emailOn = emailOn && plan.email.on;
        pushMessage = { ...message, title: plan.push.title, body: plan.push.body };
        emailMessage = { ...message, title: plan.email.title, body: plan.email.body, subject: plan.email.subject !== message.title ? plan.email.subject : undefined, emailExtras: { greeting: plan.email.greeting, button: plan.email.button, footnote: plan.email.footnote } };
        const people = `${userIds.length} ${userIds.length === 1 ? "person" : "people"}`;
        await logDeliveries([
          ...(pushOn ? [] : [{ channel: "push" as const, event: message.event, product: message.product, title: message.title, status: "off" as const, recipient: people, detail: offDetail(plan.push.reason) }]),
          ...(plan.email.on || message.email === false ? [] : [{ channel: "email" as const, event: message.event, product: message.product, title: message.title, status: "off" as const, recipient: people, detail: offDetail(plan.email.reason) }]),
        ]);
      }
      await Promise.all([pushOn ? pushToUsers(actor, userIds, pushMessage) : 0, emailOn ? emailToUsers(actor, userIds, emailMessage) : 0]);
    };
    try {
      await afterForCompany(deliver);
    } catch {
      void runAsCompany(companyId, deliver);
    }
  } catch (err) {
    console.error("[push] could not queue", err);
  }
}

/** Staff accounts of the company holding any of `roles` (for product broadcasts such as "tell HR"). */
export async function userIdsWithRoles(roles: string[]): Promise<string[]> {
  const rows = await (await getDb()).collection<{ _id: ObjectId }>("admin_users").find({ roles: { $in: roles }, status: { $nin: BLOCKED_STATUSES } }, { projection: { _id: 1 } }).limit(200).toArray();
  return rows.map((r) => String(r._id));
}
