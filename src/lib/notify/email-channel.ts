import "server-only";
import { ObjectId } from "mongodb";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { getDb } from "@/lib/mongodb";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { companyAppBaseUrl } from "@/lib/platform/tenancy/provisioning";
import { sendEmail } from "@/lib/platform/email";
import { logDeliveries, maskEmail } from "@/lib/notify/center/store";
import { renderEmail } from "@/lib/platform/email/template";
import { getPreferencesMany, type PushActor } from "@/lib/push/store";
import type { PushMessage } from "@/lib/push/send";
import { DEFAULT_FOOTNOTE, renderTemplate } from "@/lib/notify/center/shared";
import { dayKey, emailCaps, emailSubject, hourKey, safeEmailPath, wantsEmail } from "@/lib/notify/email-channel-rule";

/**
 * The email channel of notifications: the same event that raises the in-app bell and the push also lands in the person's inbox, if their own
 * choices (Notification settings → Email) say so. Best-effort like the other two: it never throws and never delays the action. Safeguards:
 *   - only the people the event is addressed to; blocked / deactivated accounts and addresses not yet verified get nothing;
 *   - per person per category switches, plus caps per hour and per day, and one email per `tag` per half hour (the same reminder fires once);
 *   - the company's own monthly email allowance still applies (`sendEmail` refuses past it), so notifications can't burn the plan;
 *   - links are same-site paths made absolute on the company's own app address; the footer points at the settings.
 */

const THROTTLE = "notification_email_throttle";
const TAG_WINDOW_MS = 30 * 60_000;

interface Recipient {
  id: string;
  email: string;
  name: string;
}

async function recipientsOf(actor: PushActor, ids: string[]): Promise<Recipient[]> {
  const db = await getDb();
  if (actor === "staff") {
    const oids = ids.filter((i) => ObjectId.isValid(i)).map((i) => new ObjectId(i));
    if (oids.length === 0) return [];
    const rows = await db.collection<{ _id: ObjectId; email?: string; name?: string; status?: string; emailVerified?: boolean }>("admin_users").find({ _id: { $in: oids }, status: { $nin: BLOCKED_STATUSES } }, { projection: { email: 1, name: 1, emailVerified: 1 } }).toArray();
    // An address the person never confirmed (a self-sign-up that has not clicked the link) is not mailed notifications.
    return rows.filter((r) => r.email && r.emailVerified !== false).map((r) => ({ id: String(r._id), email: r.email!, name: r.name ?? "" }));
  }
  const rows = await db.collection<{ _id: string; email?: string; displayName?: string; status?: string }>("external_users").find({ _id: { $in: ids }, status: "active" }, { projection: { email: 1, displayName: 1 } }).toArray();
  return rows.filter((r) => r.email).map((r) => ({ id: String(r._id), email: r.email!, name: r.displayName ?? "" }));
}

/** Counts this email against the person's caps and tag window; false = skip it. */
async function admit(userId: string, message: PushMessage): Promise<boolean> {
  const col = (await getDb()).collection<{ _id: string; n: number; expireAt: Date }>(THROTTLE);
  const now = new Date();
  await col.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
  const caps = emailCaps(message.category);
  if (message.tag) {
    const t = await col.updateOne({ _id: `${userId}:t:${message.tag}` }, { $setOnInsert: { n: 1, expireAt: new Date(now.getTime() + TAG_WINDOW_MS) } }, { upsert: true });
    if (!t.upsertedCount) return false; // this very reminder was just sent
  }
  const hour = await col.findOneAndUpdate({ _id: `${userId}:h:${hourKey(now)}` }, { $inc: { n: 1 }, $setOnInsert: { expireAt: new Date(now.getTime() + 2 * 3600_000) } }, { upsert: true, returnDocument: "after" });
  if ((hour?.n ?? 1) > caps.perHour) return false;
  const day = await col.findOneAndUpdate({ _id: `${userId}:d:${dayKey(now)}` }, { $inc: { n: 1 }, $setOnInsert: { expireAt: new Date(now.getTime() + 26 * 3600_000) } }, { upsert: true, returnDocument: "after" });
  return (day?.n ?? 1) <= caps.perDay;
}

/** Emails `userIds` of the CURRENT company who want this category. Returns how many emails were accepted for sending. */
export async function emailToUsers(actor: PushActor, userIds: string[], message: PushMessage): Promise<number> {
  try {
    const ids = [...new Set(userIds.filter(Boolean))].slice(0, 200);
    if (ids.length === 0) return 0;
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return 0;
    const [people, prefs, company] = await Promise.all([recipientsOf(actor, ids), getPreferencesMany(actor, ids), getCompany(companyId)]);
    if (!company) return 0;
    const { DEFAULT_PREFERENCES } = await import("@/lib/push/categories");
    const base = companyAppBaseUrl(company.slug, null);
    const home = actor === "portal" ? "/clientos/notifications" : "/commandos/notifications";
    const settings = actor === "portal" ? "/clientos/notifications/settings" : "/commandos/notifications/settings";
    const link = `${base}${safeEmailPath(message.url, home)}`;
    let sent = 0;
    for (const p of people) {
      if (!wantsEmail(prefs.get(p.id) ?? DEFAULT_PREFERENCES, message.category)) continue;
      if (!(await admit(p.id, message))) continue;
      // Greeting, button and small print follow the company's wording (Notification center), filled in for this person.
      const first = p.name.split(" ")[0] ?? "";
      const values = { firstName: first, settingsLink: `${base}${settings}` };
      const general = { company: company.name, link, title: message.title, body: message.body ?? "" };
      const extra = (custom: string | null | undefined, fallback: string | null) => (custom ? renderTemplate(custom, general, values) : null) ?? fallback;
      const greeting = extra(message.emailExtras?.greeting, first ? `Hi ${first},` : null);
      const { html, text } = renderEmail({
        brand: company.name,
        heading: message.title,
        paragraphs: [...(greeting ? [greeting] : []), ...(message.body ? [message.body] : [])],
        action: { label: extra(message.emailExtras?.button, "Open it") ?? "Open it", url: link },
        footnote: extra(message.emailExtras?.footnote, renderTemplate(DEFAULT_FOOTNOTE, general, values)) ?? undefined,
      });
      const res = await sendEmail({ to: p.email, subject: message.subject ? emailSubject(company.name, message.subject) : emailSubject(company.name, message.title), html, text });
      if (res.ok) sent++;
      await logDeliveries([{ channel: "email", event: message.event ?? "other", product: message.product, title: message.title, status: res.ok ? "sent" : "failed", recipient: maskEmail(p.email), detail: res.ok ? "" : res.error }]);
    }
    return sent;
  } catch (err) {
    console.error("[notify:email] delivery failed", err instanceof Error ? err.message : err);
    return 0;
  }
}
