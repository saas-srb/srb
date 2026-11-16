import "server-only";
import { getDb } from "@/lib/mongodb";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { notify } from "@/lib/platform/notifications";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getCompanyBrand } from "@/lib/platform/branding";
import { getReminderState, saveReminderState, recordSnapshot, type ReminderState } from "@/lib/platform/setup-progress/store";
import { recordPlatformSetup } from "@/lib/platform/setup-progress/platform";
import { getSetupProgress } from "@/lib/platform/setup-progress";

/**
 * Gentle reminders through the Notification center. Rules (pure, tested): nothing at 100%; when the percentage has not moved for 3 days, ONE in-app
 * reminder to the Directors; from then on one summary email a week until setup is complete. The company can switch either off in the Notification
 * center (events "Setup reminder" and "Weekly setup summary"). Never more than one of each per period, however often the job runs.
 */
export const STUCK_AFTER_DAYS = 3;
export const DIGEST_EVERY_DAYS = 7;
const DAY = 86_400_000;

export interface ReminderDecision { patch: Partial<Omit<ReminderState, "_id">>; inApp: boolean; digest: boolean }

export function decideReminders(state: Pick<ReminderState, "lastInApp" | "lastDigest" | "stuckSince" | "lastPercent">, percent: number, now: Date): ReminderDecision {
  if (percent >= 100) return { patch: { stuckSince: null, lastPercent: percent }, inApp: false, digest: false };
  // Moving at all (up or down) restarts the clock.
  const moved = state.lastPercent === null || state.lastPercent === undefined || state.lastPercent !== percent;
  const stuckSince = moved ? now : (state.stuckSince ?? now);
  const stuckDays = (now.getTime() - stuckSince.getTime()) / DAY;
  const stuck = stuckDays >= STUCK_AFTER_DAYS;
  const inApp = stuck && !(state.lastInApp && state.lastInApp.getTime() >= stuckSince.getTime());
  const digest = stuck && (!state.lastDigest || now.getTime() - state.lastDigest.getTime() >= DIGEST_EVERY_DAYS * DAY);
  return { patch: { stuckSince, lastPercent: percent, ...(inApp ? { lastInApp: now } : {}), ...(digest ? { lastDigest: now } : {}) }, inApp, digest };
}

/** One company (run inside its context): refresh the numbers, then send what is due. */
export async function runSetupReminders(now: Date = new Date()): Promise<{ percent: number; inApp: number; digest: number }> {
  const progress = await getSetupProgress({ fresh: true });
  const percent = progress.summary.percent;
  await Promise.all([recordSnapshot(percent, now).catch(() => {}), recordPlatformSetup(await currentId(), percent, now).catch(() => {})]);
  const db = await getDb();
  const owned = await db.collection<{ email: string }>("admin_users").find({ roles: "super_admin", status: { $nin: BLOCKED_STATUSES } } as never, { projection: { email: 1 } }).toArray();
  if (owned.length === 0 && percent < 100) { /* no Director to tell */ }
  const decision = decideReminders(await getReminderState(), percent, now);
  await saveReminderState(decision.patch);
  let inApp = 0, digest = 0;
  if (decision.inApp) inApp = await notify({ to: { role: "super_admin" }, type: "setup_reminder", title: `Your setup is ${percent}% done`, body: progress.next[0] ? `Next: ${progress.next[0].title}.` : "Open Setup progress to see what is left.", url: "/commandos/setup" }).catch(() => 0);
  if (decision.digest && owned.length > 0) {
    const brand = (await getCompanyBrand()).name || "Your workspace";
    const base = (await companySiteUrl()).replace(/\/$/, "");
    const { html, text } = renderEmail({
      brand, heading: `Your setup is ${percent}% done`,
      paragraphs: [`${progress.summary.done} of ${progress.summary.applicable} steps are done${progress.summary.minutesLeft > 0 ? `, about ${progress.summary.minutesLeft} minutes left` : ""}.`, ...(progress.next.length ? ["Next steps:", ...progress.next.map((n) => `- ${n.title}: ${n.description}`)] : [])],
      action: { label: "Open Setup progress", url: `${base}/commandos/setup` }, footnote: "You get this once a week until setup is complete. You can turn it off in Notification center.",
    });
    for (const u of owned) { const r = await sendEmail({ to: u.email, subject: `${brand}: your setup is ${percent}% done`, html, text, event: "setup_digest" }).catch(() => null); if (r && r.ok && r.id !== null) digest++; }
  }
  return { percent, inApp, digest };
}

async function currentId(): Promise<string> {
  return (await import("@/lib/platform/tenancy/context")).currentCompanyId();
}
