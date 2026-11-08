"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { CRON_BY_KEY } from "@/lib/cron/registry";
import { runJob } from "@/lib/cron/runner";
import { resetJobSettings, saveAlertEmails, saveJobSettings, setJobEnabled, type JobSettingsInput, type SaveResult } from "@/lib/cron/config";
import { jobHistory, type RunView } from "@/lib/cron/status";

const done = <T>(res: T) => {
  revalidatePath("/console/scheduled-jobs");
  return res;
};

/** Starts one job now, exactly as its schedule would (same lock, same record), even if it is paused. */
export async function runJobNowAction(key: string): Promise<{ ok: boolean; skipped?: boolean; summary: string; error?: string }> {
  const user = await requirePlatformPermission("settings.manage");
  const job = CRON_BY_KEY.get(String(key ?? ""));
  if (!job) return { ok: false, summary: "", error: "Unknown job." };
  const out = await runJob(job.key, { trigger: "manual", by: user.email });
  await recordPlatformAudit({ actorId: user.id, action: "cron.run", target: { type: "cron_job", id: job.key }, details: { ok: out.ok, skipped: out.skipped ?? false, durationMs: out.durationMs } });
  return done({ ok: out.ok, skipped: out.skipped, summary: out.summary, error: out.error });
}

export async function jobHistoryAction(key: string): Promise<RunView[]> {
  await requirePlatformPermission("settings.read");
  return jobHistory(String(key ?? ""), 20);
}

export async function saveJobSettingsAction(key: string, input: JobSettingsInput): Promise<SaveResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await saveJobSettings(String(key ?? ""), { enabled: !!input?.enabled, schedule: typeof input?.schedule === "string" ? input.schedule : null, note: typeof input?.note === "string" ? input.note : "" }, { id: user.id, email: user.email }));
}

/** The Enabled switch in the list: pause or resume a job. */
export async function setJobEnabledAction(key: string, enabled: boolean): Promise<SaveResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await setJobEnabled(String(key ?? ""), enabled === true, { id: user.id, email: user.email }));
}

export async function resetJobSettingsAction(key: string): Promise<SaveResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await resetJobSettings(String(key ?? ""), { id: user.id, email: user.email }));
}

export async function saveAlertEmailsAction(emails: string[]): Promise<SaveResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await saveAlertEmails(Array.isArray(emails) ? emails.map(String) : [], { id: user.id, email: user.email }));
}
