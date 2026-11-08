import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { JOB_RUNNERS, summarize } from "../src/lib/cron/jobs";
import { runJob } from "../src/lib/cron/runner";
import { healthOf, listJobStatus } from "../src/lib/cron/status";
import { CRON_BY_KEY } from "../src/lib/cron/registry";
import { effectiveJob, resetJobSettings, saveAlertEmails, saveJobSettings, setJobEnabled } from "../src/lib/cron/config";

// Runs only against a throwaway database: set MONGODB_URI=mongodb://localhost:27017/zz_throwaway_<n>.
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = await getPlatformDb();
  assert.ok(db.databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  const runs = db.collection("cron_runs");

  await t("a run is recorded with what it did", async () => {
    JOB_RUNNERS.domains = async () => [{ companyId: "a", ok: true }, { companyId: "b", ok: false, error: "boom" }];
    const out = await runJob("domains", { trigger: "manual", by: "me@example.com" });
    assert.equal(out.ok, true); assert.match(out.summary, /2 companies, 1 failed \(boom\)/);
    const row = await runs.findOne({ _id: out.runId as never });
    assert.equal(row?.status, "ok"); assert.equal(row?.trigger, "manual"); assert.equal(row?.by, "me@example.com"); assert.ok(typeof row?.durationMs === "number");
  });

  await t("a failure is recorded and returned, never thrown", async () => {
    JOB_RUNNERS.trials = async () => { throw new Error("database is down"); };
    const out = await runJob("trials", { trigger: "cron" });
    assert.equal(out.ok, false); assert.equal(out.error, "database is down");
    assert.equal((await runs.findOne({ _id: out.runId as never }))?.status, "failed");
  });

  await t("two runs at once: one runs, the other is skipped; the lock is released afterwards", async () => {
    let started = 0;
    JOB_RUNNERS.apps = async () => { started++; await sleep(300); return { dispatched: 0 }; };
    const [a, b] = await Promise.all([runJob("apps", { trigger: "cron" }), runJob("apps", { trigger: "scheduler" })]);
    assert.equal(started, 1);
    assert.equal([a, b].filter((x) => x.skipped).length, 1);
    const again = await runJob("apps", { trigger: "cron" });
    assert.equal(again.skipped, undefined); assert.equal(started, 2, "runs again once the first has finished");
  });

  await t("an unknown job is refused", async () => assert.equal((await runJob("nope", { trigger: "cron" })).ok, false));

  await t("summaries stay short", () => {
    assert.equal(summarize({ a: 1 }).text, '{"a":1}');
    assert.ok(summarize("x".repeat(1000)).text.length <= 400);
    assert.equal(summarize([{ companyId: "a", ok: true }]).text, "1 company");
  });

  await t("health: never run, ran on time, overdue, failing, running", () => {
    const job = CRON_BY_KEY.get("trials")!; // daily 06:00 UTC
    const now = new Date("2026-10-25T12:00:00Z");
    const run = (status: "ok" | "failed" | "running", startedAt: string) => ({ _id: "x", job: "trials", trigger: "cron" as const, by: null, status, startedAt: new Date(startedAt), finishedAt: null, durationMs: 1, summary: "", error: status === "failed" ? "boom" : "", expiresAt: now });
    assert.equal(healthOf(job, null, null, now).health, "waiting");
    assert.equal(healthOf(job, run("ok", "2026-10-25T06:00:05Z"), run("ok", "2026-10-25T06:00:05Z"), now).health, "healthy");
    assert.equal(healthOf(job, run("ok", "2026-10-24T06:00:05Z"), run("ok", "2026-10-24T06:00:05Z"), now).health, "overdue");
    assert.equal(healthOf(job, run("failed", "2026-10-25T06:00:05Z"), run("failed", "2026-10-25T06:00:05Z"), now).health, "failing");
    assert.equal(healthOf(job, run("running", "2026-10-25T11:59:30Z"), null, now).health, "running");
  });

  const admin = { id: "u1", email: "admin@example.com" };
  await t("a paused job is skipped by its schedule but can still be run by hand", async () => {
    let ran = 0;
    JOB_RUNNERS.cybervault = async () => { ran++; return "ok"; };
    assert.deepEqual(await saveJobSettings("cybervault", { enabled: false, schedule: null, note: "paused for a migration" }, admin), { ok: true });
    const skipped = await runJob("cybervault", { trigger: "cron" });
    assert.equal(skipped.skipped, true); assert.match(skipped.summary, /paused/); assert.equal(ran, 0);
    assert.equal((await runJob("cybervault", { trigger: "scheduler" })).skipped, true);
    assert.equal((await runJob("cybervault", { trigger: "manual", by: "a@b.c" })).ok, true); assert.equal(ran, 1);
    assert.equal((await effectiveJob("cybervault"))?.note, "paused for a migration");
    await resetJobSettings("cybervault", admin);
    assert.equal((await effectiveJob("cybervault"))?.enabled, true);
    assert.equal((await runJob("cybervault", { trigger: "cron" })).skipped, undefined); assert.equal(ran, 2);
  });

  await t("a coarser schedule is honoured on Vercel by skipping the calls in between", async () => {
    let ran = 0;
    JOB_RUNNERS.viralpulse = async () => { ran++; return "ok"; };
    await saveJobSettings("viralpulse", { enabled: true, schedule: "0 3 * * 1", note: "" }, admin); // weekly, Mondays
    assert.equal((await effectiveJob("viralpulse"))?.overridden, true);
    assert.equal((await runJob("viralpulse", { trigger: "cron" })).skipped, undefined, "first call: nothing has run since the last due time");
    const again = await runJob("viralpulse", { trigger: "cron" });
    assert.equal(again.skipped, true); assert.match(again.summary, /not due/); assert.equal(ran, 1);
    assert.equal((await runJob("viralpulse", { trigger: "scheduler" })).skipped, undefined, "the in-app scheduler fires on the changed schedule itself"); assert.equal(ran, 2);
  });

  await t("the Enabled switch pauses and resumes a job without touching its schedule or note", async () => {
    let ran = 0;
    JOB_RUNNERS.evaliq = async () => { ran++; return "ok"; };
    await saveJobSettings("evaliq", { enabled: true, schedule: "0 8 * * *", note: "keep me" }, admin);
    assert.deepEqual(await setJobEnabled("evaliq", false, admin), { ok: true });
    let cfg = await effectiveJob("evaliq");
    assert.equal(cfg?.enabled, false); assert.equal(cfg?.schedule, "0 8 * * *"); assert.equal(cfg?.note, "keep me");
    assert.equal((await runJob("evaliq", { trigger: "cron" })).skipped, true); assert.equal(ran, 0);
    assert.deepEqual(await setJobEnabled("evaliq", true, admin), { ok: true });
    cfg = await effectiveJob("evaliq");
    assert.equal(cfg?.enabled, true); assert.equal(cfg?.schedule, "0 8 * * *");
    assert.equal((await runJob("evaliq", { trigger: "scheduler" })).skipped, undefined); assert.equal(ran, 1);
    // a job with no saved settings yet can be paused too
    assert.deepEqual(await setJobEnabled("domains", false, admin), { ok: true });
    assert.equal((await effectiveJob("domains"))?.enabled, false);
    assert.equal((await setJobEnabled("nope", false, admin)).ok, false);
    assert.ok(await db.collection("platform_audit_log").findOne({ action: "cron.disable", "target.id": "domains" }), "pausing is audited");
    await setJobEnabled("domains", true, admin);
  });

  await t("settings are validated", async () => {
    assert.equal((await saveJobSettings("trials", { enabled: true, schedule: "every day", note: "" }, admin)).ok, false);
    assert.equal((await saveJobSettings("trials", { enabled: true, schedule: "61 * * * *", note: "" }, admin)).ok, false);
    assert.equal((await saveJobSettings("nope", { enabled: true, schedule: null }, admin)).ok, false);
    assert.equal((await saveJobSettings("trials", { enabled: true, schedule: "0 6 * * *", note: "" }, admin)).ok, true, "the default written out is stored as the default");
    assert.equal((await effectiveJob("trials"))?.overridden, false);
    assert.equal((await saveAlertEmails(["not-an-email"], admin)).ok, false);
    assert.equal((await saveAlertEmails(["Ops@Example.com", "ops@example.com", "cto@example.com"], admin)).ok, true);
    const audit = await db.collection("platform_audit_log").countDocuments({ action: { $in: ["cron.configure", "cron.reset", "cron.alerts"] } });
    assert.ok(audit >= 4, "changes are audited");
  });

  await t("a failure emails the alert recipients once per job per 6 hours", async () => {
    JOB_RUNNERS.playbook = async () => { throw new Error("db timeout"); };
    await runJob("playbook", { trigger: "cron" });
    await runJob("playbook", { trigger: "cron" });
    await sleep(300);
    const doc = await db.collection("cron_settings").findOne({ _id: "playbook" as never });
    assert.ok(doc?.lastAlertAt, "an alert slot was claimed");
    const first = (doc?.lastAlertAt as Date).getTime();
    await runJob("playbook", { trigger: "cron" });
    await sleep(100);
    assert.equal(((await db.collection("cron_settings").findOne({ _id: "playbook" as never }))?.lastAlertAt as Date).getTime(), first, "no second alert inside 6 hours");
  });

  await t("the page lists every job", async () => { const list = await listJobStatus(); assert.equal(list.length, 13); assert.equal(list.find((j) => j.key === "viralpulse")?.effectiveSchedule, "0 3 * * 1"); });

  await db.dropDatabase();
  console.log("cron runner tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
