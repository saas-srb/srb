import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { CRON_BY_KEY, CRON_JOBS, type CronJob } from "@/lib/cron/registry";
import { describeCron, isValidCron, nextRun } from "@/lib/cron/schedule";

/**
 * What an admin can change about the scheduled jobs (`cron_settings`, one document per job plus one for alerts). The code's registry stays
 * the default; nothing here is needed for a job to run.
 *   enabled  — a paused job is skipped when its schedule fires (it can still be started by hand)
 *   schedule — replaces the registry's times. The in-app scheduler follows it exactly. On Vercel the job is still *called* at the registry's
 *              times, so a schedule that is coarser (say weekly instead of daily) is honoured by skipping the calls in between; one that is
 *              finer than the registered times needs the in-app scheduler or a faster Vercel cron.
 *   alerts   — who is emailed when a job fails (at most one email per job every 6 hours)
 */

const COLLECTION = "cron_settings";
const ALERTS_ID = "__alerts";
const ALERT_EVERY_MS = 6 * 3_600_000;
const CACHE_MS = 15_000;

interface JobSettings {
  _id: string;
  enabled: boolean;
  schedule: string | null;
  note: string;
  lastAlertAt?: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
}
interface AlertSettings {
  _id: typeof ALERTS_ID;
  emails: string[];
  updatedAt: Date;
  updatedBy: string | null;
}

async function col() {
  return (await getPlatformDb()).collection<JobSettings | AlertSettings>(COLLECTION);
}

export interface EffectiveJob {
  key: string;
  enabled: boolean;
  /** The schedule in force: the override, else the registry's. */
  schedule: string;
  overridden: boolean;
  note: string;
}

const g = globalThis as unknown as { __cronConfig?: { at: number; rows: Map<string, JobSettings>; alerts: string[] } };

async function load(): Promise<{ rows: Map<string, JobSettings>; alerts: string[] }> {
  if (g.__cronConfig && Date.now() - g.__cronConfig.at < CACHE_MS) return g.__cronConfig;
  const docs = await (await col()).find({}).toArray();
  const rows = new Map<string, JobSettings>();
  let alerts: string[] = [];
  for (const d of docs) {
    if (d._id === ALERTS_ID) alerts = (d as AlertSettings).emails;
    else rows.set(d._id, d as JobSettings);
  }
  g.__cronConfig = { at: Date.now(), rows, alerts };
  return g.__cronConfig;
}
const forget = () => {
  g.__cronConfig = undefined;
};

const effective = (job: CronJob, s: JobSettings | undefined): EffectiveJob => ({
  key: job.key,
  enabled: s?.enabled ?? true,
  schedule: s?.schedule && isValidCron(s.schedule) ? s.schedule : job.schedule,
  overridden: !!s?.schedule && isValidCron(s.schedule) && s.schedule !== job.schedule,
  note: s?.note ?? "",
});

/** The settings in force for every job. A settings read problem falls back to the registry, so jobs keep running. */
export async function effectiveJobs(): Promise<Map<string, EffectiveJob>> {
  let rows = new Map<string, JobSettings>();
  try {
    rows = (await load()).rows;
  } catch (err) {
    console.error("[cron] could not read job settings; using the registry", err);
  }
  return new Map(CRON_JOBS.map((j) => [j.key, effective(j, rows.get(j.key))]));
}

export async function effectiveJob(key: string): Promise<EffectiveJob | null> {
  return (await effectiveJobs()).get(key) ?? null;
}

export async function alertEmails(): Promise<string[]> {
  try {
    return (await load()).alerts;
  } catch {
    return [];
  }
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface JobSettingsInput {
  enabled: boolean;
  /** null or "" = the registry's schedule. */
  schedule: string | null;
  note?: string;
}

export async function saveJobSettings(key: string, input: JobSettingsInput, actor: { id: string; email: string }): Promise<SaveResult> {
  const job = CRON_BY_KEY.get(key);
  if (!job) return { ok: false, error: "Unknown job." };
  const schedule = (input.schedule ?? "").trim().replace(/\s+/g, " ");
  if (schedule && !isValidCron(schedule)) return { ok: false, error: "That isn't a valid schedule. Use five fields: minute hour day-of-month month day-of-week (UTC), e.g. 30 2 * * * for every day at 02:30." };
  if (schedule && !nextRun(schedule)) return { ok: false, error: "That schedule never runs." };
  const keep = schedule && schedule !== job.schedule ? schedule : null;
  await (await col()).updateOne({ _id: key }, { $set: { enabled: !!input.enabled, schedule: keep, note: (input.note ?? "").trim().slice(0, 200), updatedAt: new Date(), updatedBy: actor.email } }, { upsert: true });
  forget();
  await recordPlatformAudit({ actorId: actor.id, action: "cron.configure", target: { type: "cron_job", id: key }, details: { enabled: !!input.enabled, schedule: keep ?? "default", described: describeCron(keep ?? job.schedule) } });
  return { ok: true };
}

/** Pauses or resumes one job without touching its schedule or note. */
export async function setJobEnabled(key: string, enabled: boolean, actor: { id: string; email: string }): Promise<SaveResult> {
  const job = CRON_BY_KEY.get(key);
  if (!job) return { ok: false, error: "Unknown job." };
  const now = new Date();
  await (await col()).updateOne({ _id: key }, { $set: { enabled: !!enabled, updatedAt: now, updatedBy: actor.email }, $setOnInsert: { schedule: null, note: "" } }, { upsert: true });
  forget();
  await recordPlatformAudit({ actorId: actor.id, action: enabled ? "cron.enable" : "cron.disable", target: { type: "cron_job", id: key }, details: { job: job.name } });
  return { ok: true };
}

export async function resetJobSettings(key: string, actor: { id: string; email: string }): Promise<SaveResult> {
  if (!CRON_BY_KEY.has(key)) return { ok: false, error: "Unknown job." };
  await (await col()).deleteOne({ _id: key });
  forget();
  await recordPlatformAudit({ actorId: actor.id, action: "cron.reset", target: { type: "cron_job", id: key } });
  return { ok: true };
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export async function saveAlertEmails(emails: string[], actor: { id: string; email: string }): Promise<SaveResult> {
  const clean = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (clean.length > 10) return { ok: false, error: "Up to 10 addresses." };
  const bad = clean.find((e) => !EMAIL.test(e));
  if (bad) return { ok: false, error: `"${bad}" isn't an email address.` };
  await (await col()).updateOne({ _id: ALERTS_ID }, { $set: { emails: clean, updatedAt: new Date(), updatedBy: actor.email } }, { upsert: true });
  forget();
  await recordPlatformAudit({ actorId: actor.id, action: "cron.alerts", target: { type: "cron_alerts", id: ALERTS_ID }, details: { recipients: clean.length } });
  return { ok: true };
}

/** Emails the alert recipients that a job failed (once per job per 6 hours). Never throws. */
export async function alertJobFailed(job: CronJob, error: string): Promise<void> {
  try {
    const emails = await alertEmails();
    if (emails.length === 0) return;
    const c = await col();
    const now = new Date();
    // Claim the alert slot first, so two failing runs send one email.
    const claimed = await c.findOneAndUpdate({ _id: job.key, $or: [{ lastAlertAt: { $exists: false } }, { lastAlertAt: null }, { lastAlertAt: { $lt: new Date(now.getTime() - ALERT_EVERY_MS) } }] }, { $set: { lastAlertAt: now } });
    if (!claimed) {
      const exists = await c.findOne({ _id: job.key });
      if (exists) return; // alerted recently
      await c.updateOne({ _id: job.key }, { $setOnInsert: { enabled: true, schedule: null, note: "", updatedAt: now, updatedBy: null }, $set: { lastAlertAt: now } }, { upsert: true });
    }
    const [{ sendEmail }, { renderEmail }, { saasAppOrigin }] = await Promise.all([import("@/lib/platform/email"), import("@/lib/platform/email/template"), import("@/lib/platform/saas/hosts")]);
    const { html, text } = renderEmail({
      brand: "Scheduled jobs",
      heading: `${job.name} failed`,
      paragraphs: [`The scheduled job "${job.name}" failed at ${now.toISOString().replace("T", " ").slice(0, 16)} UTC.`, `Error: ${error}`, "It runs again on its next schedule. You get at most one email per job every 6 hours."],
      action: { label: "Open Scheduled jobs", url: `${saasAppOrigin()}/console/scheduled-jobs` },
    });
    await Promise.all(emails.map((to) => sendEmail({ to, subject: `Scheduled job failed: ${job.name}`, html, text })));
  } catch (err) {
    console.error("[cron] could not send the failure alert", err);
  }
}
