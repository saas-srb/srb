import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import { randomUUID } from "node:crypto";
import { afterForCompany, currentCompanyIdOrNull, runAsCompany } from "@/lib/platform/tenancy/context";
import { pushConfigured, pushKeys, vapidDetails, webpush } from "@/lib/push/vapid";
import { broadcastsCol, getWebPushSettings, subscribersCol, type Broadcast } from "@/lib/webpush/store";
import { safeSitePath, type WebPushTopic } from "@/lib/webpush/topics";

/**
 * Sends a notification from the CURRENT company to the visitors of its website who subscribed to `topic`. Every send leaves a
 * `web_push_broadcasts` row (what, to how many, how many arrived, clicks). Capped per day so a business can't spam its visitors,
 * and bounded in time so a serverless function never runs out mid-way (the rest is reported as "partial").
 */

export interface BroadcastInput {
  topic: WebPushTopic;
  title: string;
  body: string;
  url?: string | null;
  trigger: Broadcast["trigger"];
  createdBy?: string | null;
}

export type BroadcastResult = { ok: true; broadcast: Broadcast } | { ok: false; error: string; broadcast?: Broadcast };

const BATCH = 500;
const CONCURRENCY = 20;
const TIME_BUDGET_MS = 45_000;
const MAX_FAILURES = 5;

const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const keys = await pushKeys();
  if (!keys) return { ok: false, error: "Push notifications aren't enabled on this server yet." };
  const settings = await getWebPushSettings();
  if (!settings.enabled) return { ok: false, error: "Website notifications are switched off. Turn them on first." };
  if (!settings.topics[input.topic]) return { ok: false, error: "That topic is switched off." };
  if (input.trigger !== "manual") {
    const key = input.trigger === "offer" ? "offers" : input.trigger === "reward" ? "rewards" : "updates";
    if (!settings.automations[key]) return { ok: false, error: "This automatic notification is switched off." };
  }

  const title = input.title.trim().slice(0, 65);
  const body = input.body.trim().slice(0, 180);
  if (!title) return { ok: false, error: "Add a title." };
  const url = safeSitePath(input.url);

  const broadcasts = await broadcastsCol();
  const subs = await subscribersCol();
  const base: Broadcast = { _id: randomUUID(), topic: input.topic, title, body, url, trigger: input.trigger, status: "sending", note: null, targeted: 0, sent: 0, failed: 0, clicks: 0, createdAt: new Date(), createdBy: input.createdBy ?? null };

  // Daily cap: manual and automatic sends share it. Skipped attempts are recorded so the owner can see why nothing went out.
  const today = await broadcasts.countDocuments({ createdAt: { $gte: startOfUtcDay() }, status: { $ne: "skipped" } });
  if (today >= settings.dailyCap) {
    const skipped: Broadcast = { ...base, status: "skipped", note: `Daily limit of ${settings.dailyCap} reached` };
    await broadcasts.insertOne(skipped);
    return { ok: false, error: `Daily limit reached (${settings.dailyCap} notifications per day). Try again tomorrow or raise the limit.`, broadcast: skipped };
  }

  const targeted = await subs.countDocuments({ topics: input.topic });
  if (targeted === 0) {
    const none: Broadcast = { ...base, status: "skipped", note: "No subscribers for this topic" };
    await broadcasts.insertOne(none);
    return { ok: false, error: "Nobody has subscribed to this topic yet.", broadcast: none };
  }
  await broadcasts.insertOne({ ...base, targeted });

  const payload = JSON.stringify({ title, body, url, tag: `${input.topic}`, broadcastId: base._id, topic: input.topic });
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  let last = "";
  let timedOut = false;
  try {
    while (!timedOut) {
      const rows = await subs.find({ topics: input.topic, ...(last ? { _id: { $gt: last } } : {}) }).sort({ _id: 1 }).limit(BATCH).toArray();
      if (rows.length === 0) break;
      last = rows[rows.length - 1]._id;
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, rows.length) }, async () => {
          while (next < rows.length) {
            const row = rows[next++];
            try {
              await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, payload, { TTL: 60 * 60 * 24 * 2, urgency: "normal", vapidDetails: vapidDetails(keys) });
              sent++;
            } catch (err) {
              failed++;
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410 || row.failures + 1 >= MAX_FAILURES) await subs.deleteOne({ _id: row._id });
              else await subs.updateOne({ _id: row._id }, { $inc: { failures: 1 } });
            }
          }
        }),
      );
      if (Date.now() - started > TIME_BUDGET_MS) timedOut = true;
    }
  } catch (err) {
    console.error("[webpush] broadcast failed", err);
  }
  const status: Broadcast["status"] = sent === 0 && failed > 0 ? "failed" : timedOut ? "partial" : "sent";
  const note = timedOut ? "Stopped early to stay within the time limit; some visitors were not reached." : null;
  await broadcasts.updateOne({ _id: base._id }, { $set: { status, sent, failed, note } });
  await cmsEvents.broadcastDone({ id: base._id, title, status, sent, targeted, failed }, input.createdBy ?? null);
  return { ok: true, broadcast: { ...base, targeted, status, sent, failed, note } };
}

/** For the automations: run after the response, in the current company's scope. Never throws. */
export async function queueBroadcast(input: BroadcastInput): Promise<void> {
  try {
    if (!(await pushConfigured())) return;
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return;
    const run = () => sendBroadcast(input).then((r) => (!r.ok && !r.broadcast ? undefined : undefined));
    try {
      await afterForCompany(run);
    } catch {
      void runAsCompany(companyId, run);
    }
  } catch (err) {
    console.error("[webpush] could not queue", err);
  }
}
