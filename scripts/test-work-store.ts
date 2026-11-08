import assert from "node:assert/strict";
import { getPlatformDb } from "../src/lib/platform/tenancy/platform-db";
import { runAsCompany } from "../src/lib/platform/tenancy/context";
import { WORK_TASKS } from "../src/lib/products/cashflow-ai/work/catalog";
import { getPlan, loadWork, markDone, reopenWork, setStep, skipWork, startPlan } from "../src/lib/products/cashflow-ai/work/store";

// Runs only against a throwaway database (MONGODB_URI=…/zz_throwaway_*).
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const actor = { id: "u1", email: null };
const TODAY = "2026-10-29";
const daily = WORK_TASKS.find((x) => x.frequency === "daily" && x.steps.length >= 3 && x.steps.every((s) => !s.auto))!;
const dailyWithAuto = WORK_TASKS.find((x) => x.frequency === "daily" && x.steps.some((s) => s.auto))!;
const P = "2026-10-05";
const P2 = "2026-10-06";
const n = daily.steps.length;
const none = () => daily.steps.map(() => false);

(async () => {
  assert.ok((await getPlatformDb()).databaseName.startsWith("zz_throwaway_"), "refusing: not a throwaway database");
  await (await getPlatformDb()).dropDatabase();

  await runAsCompany("co_x", async () => {
    await t("nothing can be ticked or loaded before the plan starts", async () => {
      assert.equal(await getPlan(), null);
      assert.equal((await loadWork(TODAY)).plan, null);
      assert.equal((await loadWork(TODAY)).instances.length, 0);
    });

    await t("the plan starts only once and the start day never moves", async () => {
      assert.equal((await startPlan("not-a-date", actor)).ok, false);
      assert.ok((await startPlan("2026-10-01", actor)).ok);
      const again = await startPlan("2026-10-20", actor);
      assert.equal(again.ok, false);
      assert.equal((await getPlan())!.startDate, "2026-10-01");
    });

    await t("loadWork shows a past period with no log as overdue", async () => {
      const { instances } = await loadWork(TODAY);
      const i = instances.find((x) => x.task.id === daily.id && x.period.key === P)!;
      assert.equal(i.state, "overdue");
      assert.equal(i.daysLate, 24);
      assert.equal(i.stepsDone, 0);
    });

    await t("setStep ticks and unticks, and refuses an unknown task, step or a negative/fractional step", async () => {
      let r = await setStep(daily.id, P, 0, true, actor);
      assert.ok(r.ok && r.steps[0] && r.steps.length === n);
      r = await setStep(daily.id, P, 1, true, actor);
      assert.ok(r.ok && r.steps[0] && r.steps[1]);
      r = await setStep(daily.id, P, 0, false, actor);
      assert.ok(r.ok && !r.steps[0] && r.steps[1]);
      assert.equal((await setStep("nope", P, 0, true, actor)).ok, false);
      assert.equal((await setStep(daily.id, P, n, true, actor)).ok, false);
      assert.equal((await setStep(daily.id, P, -1, true, actor)).ok, false);
      assert.equal((await setStep(daily.id, P, 0.5, true, actor)).ok, false);
      const i = (await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P)!;
      assert.equal(i.stepsDone, 1);
    });

    await t("two ticks of different steps at the same moment on a brand-new item both stay", async () => {
      const [a, b] = await Promise.all([setStep(daily.id, P2, 0, true, actor), setStep(daily.id, P2, 1, true, actor)]);
      assert.ok(a.ok && b.ok);
      const i = (await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P2)!;
      assert.deepEqual(i.steps.slice(0, 2), [true, true]);
    });

    await t("markDone refuses with unticked steps and says how many", async () => {
      const r = await markDone(daily.id, P, none(), actor);
      assert.equal(r.ok, false);
      assert.match((r as { error: string }).error, /still not ticked/);
      assert.equal((await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P)!.state, "overdue");
    });

    await t("markDone accepts when the auto array covers the rest, and is idempotent", async () => {
      // step 1 is ticked by hand; the system proves every other step
      const auto = daily.steps.map((_, i) => i !== 1);
      assert.ok((await markDone(daily.id, P, auto, actor)).ok);
      const first = (await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P)!;
      assert.equal(first.state, "done");
      assert.ok(first.steps.every(Boolean));
      const doneAt = first.log!.doneAt;
      assert.ok((await markDone(daily.id, P, none(), actor)).ok);
      assert.equal((await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P)!.log!.doneAt, doneAt);
    });

    await t("a done item cannot be changed until reopened; reopen keeps the ticks", async () => {
      const r = await setStep(daily.id, P, 0, false, actor);
      assert.equal(r.ok, false);
      assert.match((r as { error: string }).error, /already marked done/);
      assert.ok((await reopenWork(daily.id, P, actor)).ok);
      assert.equal((await reopenWork(daily.id, P, actor)).ok, false);
      const i = (await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P)!;
      assert.equal(i.state, "overdue");
      assert.ok(i.log!.status === "open");
      assert.ok((await setStep(daily.id, P, 0, false, actor)).ok);
    });

    await t("skipWork needs a real reason, records it, and a skipped item cannot be ticked", async () => {
      const P3 = "2026-10-07";
      for (const bad of ["", "   ", "no", "x".repeat(301)]) assert.equal((await skipWork(daily.id, P3, bad, actor)).ok, false, bad);
      assert.equal((await skipWork("nope", P3, "a good reason", actor)).ok, false);
      assert.ok((await skipWork(daily.id, P3, "  Office closed for the festival  ", actor)).ok);
      const i = (await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P3)!;
      assert.equal(i.state, "skipped");
      assert.equal(i.log!.skipReason, "Office closed for the festival");
      assert.equal((await setStep(daily.id, P3, 0, true, actor)).ok, false);
      assert.ok((await reopenWork(daily.id, P3, actor)).ok);
      assert.equal((await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P3)!.state, "overdue");
    });

    await t("a step the system proves counts only if the auto array says so", async () => {
      const k = "2026-10-08";
      const k2 = dailyWithAuto.steps.length;
      assert.equal((await markDone(dailyWithAuto.id, k, Array.from({ length: k2 }, () => false), actor)).ok, false);
      assert.ok((await markDone(dailyWithAuto.id, k, Array.from({ length: k2 }, () => true), actor)).ok);
    });
  });

  await t("another company sees none of this", async () => {
    await runAsCompany("co_y", async () => {
      assert.equal(await getPlan(), null);
      assert.equal((await loadWork(TODAY)).instances.length, 0);
      assert.ok((await startPlan("2026-10-15", actor)).ok);
      const i = (await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === "2026-10-16")!;
      assert.equal(i.stepsDone, 0);
      assert.equal(i.state, "overdue");
      const same = (await loadWork(TODAY)).instances.find((x) => x.task.id === daily.id && x.period.key === P);
      assert.equal(same, undefined);
    });
  });

  console.log("work store tests passed");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
